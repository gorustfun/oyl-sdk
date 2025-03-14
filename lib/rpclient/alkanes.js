"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlkanesRpc = exports.stripHexPrefix = void 0;
const tslib_1 = require("tslib");
const node_fetch_1 = tslib_1.__importDefault(require("node-fetch"));
const tiny_async_pool_1 = tslib_1.__importDefault(require("tiny-async-pool"));
const factory_1 = require("../amm/factory");
const pool_1 = require("../amm/pool");
const stripHexPrefix = (s) => s.substr(0, 2) === '0x' ? s.substr(2) : s;
exports.stripHexPrefix = stripHexPrefix;
const opcodes = ['99', '100', '101', '102', '103', '104', '1000'];
const opcodesHRV = [
    'name',
    'symbol',
    'totalSupply',
    'cap',
    'minted',
    'mintAmount',
    'data',
];
class AlkanesRpc {
    alkanesUrl;
    constructor(url) {
        this.alkanesUrl = url;
    }
    async _call(method, params = []) {
        const requestData = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: 1,
        };
        const requestOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
            cache: 'no-cache',
        };
        try {
            const response = await (0, node_fetch_1.default)(this.alkanesUrl, requestOptions);
            const responseData = await response.json();
            if (responseData.error)
                throw new Error(responseData.error.message);
            return responseData.result;
        }
        catch (error) {
            if (error.name === 'AbortError') {
                console.error('Request Timeout:', error);
                throw new Error('Request timed out');
            }
            else {
                console.error('Request Error:', error);
                throw error;
            }
        }
    }
    async getAlkanesByHeight({ height, protocolTag = '1', }) {
        return (await this._call('alkanes_protorunesbyheight', [
            {
                height,
                protocolTag,
            },
        ]));
    }
    async getAlkanesByAddress({ address, protocolTag = '1', name, }) {
        const ret = await this._call('alkanes_protorunesbyaddress', [
            {
                address,
                protocolTag,
            },
        ]);
        const alkanesList = ret.outpoints
            .filter((outpoint) => outpoint.runes.length > 0)
            .map((outpoint) => ({
            ...outpoint,
            outpoint: {
                vout: outpoint.outpoint.vout,
                txid: Buffer.from(outpoint.outpoint.txid, 'hex')
                    .reverse()
                    .toString('hex'),
            },
            runes: outpoint.runes.map((rune) => ({
                ...rune,
                balance: parseInt(rune.balance, 16).toString(),
                rune: {
                    ...rune.rune,
                    id: {
                        block: parseInt(rune.rune.id.block, 16).toString(),
                        tx: parseInt(rune.rune.id.tx, 16).toString(),
                    },
                },
            })),
        }));
        if (name) {
            return alkanesList.flatMap((outpoints) => outpoints.runes.filter((item) => item.rune.name === name));
        }
        return alkanesList;
    }
    async trace(request) {
        request.txid = Buffer.from(request.txid, 'hex').reverse().toString('hex');
        const ret = await this._call('alkanes_trace', [request]);
        return await ret;
    }
    async simulate(request, decoder) {
        const ret = await this._call('alkanes_simulate', [
            {
                alkanes: [],
                transaction: '0x',
                block: '0x',
                height: '20000',
                txindex: 0,
                inputs: [],
                pointer: 0,
                refundPointer: 0,
                vout: 0,
                ...request,
            },
        ]);
        if (decoder) {
            const operationType = Number(request.inputs[0]);
            ret.parsed = decoder(ret, operationType);
        }
        else {
            ret.parsed = this.parseSimulateReturn(ret.execution.data);
        }
        return ret;
    }
    parseSimulateReturn(v) {
        if (v === '0x') {
            return undefined;
        }
        const stripHexPrefix = (v) => (v.startsWith('0x') ? v.slice(2) : v);
        const addHexPrefix = (v) => '0x' + stripHexPrefix(v);
        let decodedString;
        try {
            decodedString = Buffer.from(stripHexPrefix(v), 'hex').toString('utf8');
            if (/[\uFFFD]/.test(decodedString)) {
                throw new Error('Invalid UTF-8 string');
            }
        }
        catch (err) {
            decodedString = addHexPrefix(v);
        }
        return {
            string: decodedString,
            bytes: addHexPrefix(v),
            le: BigInt(addHexPrefix(Buffer.from(Array.from(Buffer.from(stripHexPrefix(v), 'hex')).reverse()).toString('hex'))).toString(),
            be: BigInt(addHexPrefix(v)).toString(),
        };
    }
    // @dev WIP
    // async meta(request: Partial<AlkaneSimulateRequest>, decoder?: any) {
    //   const ret = await this._call('alkanes___meta', [
    //     {
    //       alkanes: [],
    //       transaction: '0x',
    //       block: '0x',
    //       height: '20000',
    //       txindex: 0,
    //       inputs: [],
    //       pointer: 0,
    //       refundPointer: 0,
    //       vout: 0,
    //       ...request,
    //     },
    //   ])
    //   if (decoder) {
    //     const operationType = Number(request.inputs[0])
    //     ret.parsed = decoder(ret, operationType)
    //   } else {
    //     ret.parsed = this.parseSimulateReturn(ret.execution.data)
    //   }
    //   return ret
    // }
    async getAlkanesByOutpoint({ txid, vout, protocolTag = '1', }) {
        const alkaneList = await this._call('alkanes_protorunesbyoutpoint', [
            {
                txid: Buffer.from(txid, 'hex').reverse().toString('hex'),
                vout,
                protocolTag,
            },
        ]);
        return alkaneList.map((outpoint) => ({
            ...outpoint,
            token: {
                ...outpoint.token,
                id: {
                    block: parseInt(outpoint.token.id.block, 16).toString(),
                    tx: parseInt(outpoint.token.id.tx, 16).toString(),
                },
            },
            value: parseInt(outpoint.value, 16).toString(),
        }));
    }
    async getAlkaneById({ block, tx, }) {
        const alkaneData = {
            name: '',
            mintActive: false,
            percentageMinted: 0,
            symbol: '',
            totalSupply: 0,
            cap: 0,
            minted: 0,
            mintAmount: 0,
        };
        for (let j = 0; j < opcodes.length; j++) {
            try {
                const result = await this.simulate({
                    target: { block, tx },
                    alkanes: [],
                    transaction: '0x',
                    block: '0x',
                    height: '20000',
                    txindex: 0,
                    inputs: [opcodes[j]],
                    pointer: 0,
                    refundPointer: 0,
                    vout: 0,
                });
                if (result.status === 0) {
                    alkaneData[opcodesHRV[j]] = Number(result.parsed?.le || 0);
                    if (opcodesHRV[j] === 'name' ||
                        opcodesHRV[j] === 'symbol' ||
                        opcodesHRV[j] === 'data') {
                        alkaneData[opcodesHRV[j]] = result.parsed?.string || '';
                    }
                    alkaneData.mintActive =
                        Number(alkaneData.minted) < Number(alkaneData.cap);
                    alkaneData.percentageMinted = Math.floor((alkaneData.minted / alkaneData.cap) * 100);
                }
            }
            catch (error) {
                console.log(error);
            }
        }
        return alkaneData;
    }
    async getAlkanes({ limit, offset = 0, }) {
        if (limit > 1000) {
            throw new Error('Max limit reached. Request fewer than 1000 alkanes per call');
        }
        const indices = Array.from({ length: limit - offset + 1 }, (_, i) => i + offset);
        const processAlkane = async (index) => {
            const alkaneData = {
                id: {
                    block: '2',
                    tx: index.toString(),
                },
            };
            let hasValidResult = false;
            const validOpcodes = opcodes.filter((opcode) => opcode !== undefined);
            try {
                const opcodeResults = await Promise.all(validOpcodes.map(async (opcode, opcodeIndex) => {
                    if (!opcode)
                        return null;
                    try {
                        const result = await this.simulate({
                            target: { block: '2', tx: index.toString() },
                            alkanes: [],
                            transaction: '0x',
                            block: '0x',
                            height: '20000',
                            txindex: 0,
                            inputs: [opcode],
                            pointer: 0,
                            refundPointer: 0,
                            vout: 0,
                        });
                        if (result?.status === 0) {
                            return {
                                opcode,
                                result,
                                opcodeIndex,
                                opcodeHRV: opcodesHRV[opcodeIndex],
                            };
                        }
                    }
                    catch (error) {
                        return null;
                    }
                    return null;
                }));
                const validResults = opcodeResults.filter((item) => {
                    return (item !== null &&
                        item !== undefined &&
                        item.opcodeHRV !== undefined);
                });
                validResults.forEach(({ result, opcodeHRV }) => {
                    if (!opcodeHRV)
                        return;
                    if (['name', 'symbol', 'data'].includes(opcodeHRV)) {
                        alkaneData[opcodeHRV] = result.parsed?.string || '';
                    }
                    else {
                        alkaneData[opcodeHRV] = Number(result.parsed?.le || 0);
                    }
                    hasValidResult = true;
                });
                if (hasValidResult) {
                    alkaneData.mintActive =
                        Number(alkaneData.minted || 0) < Number(alkaneData.cap || 0);
                    alkaneData.percentageMinted = Math.floor(((alkaneData.minted || 0) / (alkaneData.cap || 1)) * 100);
                    return alkaneData;
                }
            }
            catch (error) {
                console.log(`Error processing alkane at index ${index}:`, error);
            }
            return null;
        };
        const results = [];
        for await (const result of (0, tiny_async_pool_1.default)(10, indices, processAlkane)) {
            if (result !== null) {
                results.push(result);
            }
        }
        return results;
    }
    async getAllPools({ block, tx, }) {
        const request = {
            target: { block, tx },
            inputs: ['3'],
            alkanes: [],
        };
        const poolsWithDetails = [];
        const { parsed } = await this.simulate(request, factory_1.AlkanesAMMPoolFactoryDecoder.decodeSimulation);
        for (const poolId of parsed.pools) {
            const poolDetailsRequest = {
                target: poolId,
                inputs: [
                    '999', // opcode 999 = pool_details
                ],
                alkanes: [],
            };
            const { parsed: poolDetails } = await this.simulate(poolDetailsRequest, pool_1.AlkanesAMMPoolDecoder.decodeSimulation);
            if (poolDetails) {
                poolsWithDetails.push({
                    ...poolDetails,
                    poolId,
                });
            }
        }
        return {
            count: poolsWithDetails.length,
            pools: poolsWithDetails,
        };
    }
}
exports.AlkanesRpc = AlkanesRpc;
//# sourceMappingURL=alkanes.js.map