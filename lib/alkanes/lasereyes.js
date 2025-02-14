"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.actualSendFee = exports.send = exports.createSendPsbt = exports.tokenDeployment = void 0;
const tslib_1 = require("tslib");
const integer_1 = require("@magiceden-oss/runestone-lib/dist/src/integer");
const index_js_1 = require("alkanes/lib/index.js");
const protoruneruneid_1 = require("alkanes/lib/protorune/protoruneruneid");
const errors_1 = require("../errors");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const utils_1 = require("../shared/utils");
const alkanes_1 = require("./alkanes");
const tokenDeployment = async ({ payload, gatheredUtxos, account, protostone, provider, feeRate, signer, }) => {
    const { script, txId } = await (0, alkanes_1.deployCommit)({
        payload,
        gatheredUtxos,
        account,
        provider,
        feeRate,
        signer,
    });
    await (0, utils_1.timeout)(3000);
    const reveal = await (0, alkanes_1.executeReveal)({
        protostone,
        script,
        commitTxId: txId,
        account,
        provider,
        feeRate,
        signer,
    });
    return { ...reveal, commitTx: txId };
};
exports.tokenDeployment = tokenDeployment;
const createSendPsbt = async ({ gatheredUtxos, account, alkaneId, provider, toAddress, amount, feeRate, fee, }) => {
    try {
        const { updatedUtxos, finalFee } = (0, utils_1.calculateUtxoFeesAndGather)({
            gatheredUtxos,
            feeRate,
            fee,
        });
        const { alkaneUtxos, totalSatoshis } = await (0, alkanes_1.findAlkaneUtxos)({
            address: account.taproot.address,
            greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
            alkaneId,
            provider,
            targetNumberOfAlkanes: amount,
        });
        if (alkaneUtxos.length === 0) {
            throw new errors_1.OylTransactionError(Error('No Alkane Utxos Found'));
        }
        let psbt = new bitcoin.Psbt({ network: provider.network });
        for await (const utxo of alkaneUtxos) {
            if ((0, utils_1.getAddressType)(utxo.address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                psbt.addInput({
                    hash: utxo.txId,
                    index: parseInt(utxo.txIndex),
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_1.getAddressType)(utxo.address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: utxo.txId,
                    index: parseInt(utxo.txIndex),
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: utxo.satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, utils_1.getAddressType)(utxo.address) === 1 ||
                (0, utils_1.getAddressType)(utxo.address) === 3) {
                psbt.addInput({
                    hash: utxo.txId,
                    index: parseInt(utxo.txIndex),
                    witnessUtxo: {
                        value: utxo.satoshis,
                        script: Buffer.from(utxo.script, 'hex'),
                    },
                });
            }
        }
        if (updatedUtxos.totalAmount < finalFee + utils_1.inscriptionSats * 2) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        for (let i = 0; i < updatedUtxos.utxos.length; i++) {
            if ((0, utils_1.getAddressType)(updatedUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(updatedUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: updatedUtxos.utxos[i].txId,
                    index: updatedUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_1.getAddressType)(updatedUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: updatedUtxos.utxos[i].txId,
                    index: updatedUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: updatedUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, utils_1.getAddressType)(updatedUtxos.utxos[i].address) === 1 ||
                (0, utils_1.getAddressType)(updatedUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: updatedUtxos.utxos[i].txId,
                    index: updatedUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: updatedUtxos.utxos[i].satoshis,
                        script: Buffer.from(updatedUtxos.utxos[i].scriptPk, 'hex'),
                    },
                });
            }
        }
        const protostone = (0, index_js_1.encodeRunestoneProtostone)({
            protostones: [
                index_js_1.ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [
                        {
                            id: new protoruneruneid_1.ProtoruneRuneId((0, integer_1.u128)(BigInt(alkaneId.block)), (0, integer_1.u128)(BigInt(alkaneId.tx))),
                            amount: (0, integer_1.u128)(BigInt(amount)),
                            output: (0, integer_1.u32)(BigInt(1)),
                        },
                    ],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: Buffer.from([]),
                }),
            ],
        }).encodedRunestone;
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: account.taproot.address,
        });
        psbt.addOutput({
            value: utils_1.inscriptionSats,
            address: toAddress,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = updatedUtxos.totalAmount +
            totalSatoshis -
            (finalFee + utils_1.inscriptionSats * 2);
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbtTx.toBase64() };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createSendPsbt = createSendPsbt;
const send = async ({ gatheredUtxos, toAddress, amount, alkaneId, feeRate, account, provider, signer, }) => {
    const { fee } = await (0, exports.actualSendFee)({
        gatheredUtxos,
        account,
        alkaneId,
        amount,
        provider,
        toAddress,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createSendPsbt)({
        gatheredUtxos,
        account,
        alkaneId,
        amount,
        provider,
        toAddress,
        feeRate,
        fee,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const result = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return result;
};
exports.send = send;
const actualSendFee = async ({ gatheredUtxos, account, alkaneId, provider, toAddress, amount, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createSendPsbt)({
        gatheredUtxos,
        account,
        alkaneId,
        provider,
        toAddress,
        amount,
        feeRate,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
        network: account.network,
    });
    const signedHexPsbt = rawPsbt.extractTransaction().toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([signedHexPsbt]))[0].vsize;
    const correctFee = vsize * feeRate;
    const { psbt: finalPsbt } = await (0, exports.createSendPsbt)({
        gatheredUtxos,
        account,
        alkaneId,
        provider,
        toAddress,
        amount,
        feeRate,
        fee: correctFee,
    });
    const { signedPsbt: signedAll } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    let finalRawPsbt = bitcoin.Psbt.fromBase64(signedAll, {
        network: account.network,
    });
    const finalSignedHexPsbt = finalRawPsbt.extractTransaction().toHex();
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalSignedHexPsbt]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualSendFee = actualSendFee;
//# sourceMappingURL=lasereyes.js.map