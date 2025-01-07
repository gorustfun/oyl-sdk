"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.execute = exports.deployReveal = exports.deployCommit = exports.send = exports.actualExecuteFee = exports.actualDeployRevealFee = exports.actualDeployCommitFee = exports.actualSendFee = exports.findAlkaneUtxos = exports.createDeployReveal = exports.createDeployCommit = exports.createExecutePsbt = exports.createSendPsbt = void 0;
const tslib_1 = require("tslib");
const btc_1 = require("../btc/btc");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const envelope = tslib_1.__importStar(require("alkanes/lib/index.js"));
const utils_1 = require("../shared/utils");
const errors_1 = require("../errors");
const utils_2 = require("../shared/utils");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
const bip341_1 = require("bitcoinjs-lib/src/payments/bip341");
const path_1 = tslib_1.__importDefault(require("path"));
const fs_extra_1 = tslib_1.__importDefault(require("fs-extra"));
const node_zlib_1 = require("node:zlib");
const util_1 = require("util");
const index_js_1 = require("alkanes/lib/index.js");
const integer_1 = require("@magiceden-oss/runestone-lib/dist/src/integer");
const protoruneruneid_1 = require("alkanes/lib/protorune/protoruneruneid");
const createSendPsbt = async ({ gatheredUtxos, account, alkaneId, provider, toAddress, amount, feeRate, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 3,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(utils_1.inscriptionSats));
        if (gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 3,
            });
            finalFee = Math.max(txSize * feeRate, 250);
            gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee) + Number(amount));
        }
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const { alkaneUtxos, totalSatoshis } = await (0, exports.findAlkaneUtxos)({
            address: account.taproot.address,
            greatestToLeast: account.spendStrategy.utxoSortGreatestToLeast,
            alkaneId,
            provider,
            targetNumberOfAlkanes: amount,
        });
        for await (const utxo of alkaneUtxos) {
            if ((0, utils_2.getAddressType)(utxo.address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(utxo.txId);
                psbt.addInput({
                    hash: utxo.txId,
                    index: parseInt(utxo.txIndex),
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_2.getAddressType)(utxo.address) === 2) {
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
            if ((0, utils_2.getAddressType)(utxo.address) === 1 ||
                (0, utils_2.getAddressType)(utxo.address) === 3) {
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
        if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
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
            value: totalSatoshis,
            address: toAddress,
        });
        const output = { script: protostone, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + utils_1.inscriptionSats);
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
const createExecutePsbt = async ({ gatheredUtxos, account, calldata, provider, feeRate, fee = 0, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minTxSize = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        let calculatedFee = Math.max(minTxSize * feeRate, 250);
        let finalFee = fee === 0 ? calculatedFee : fee;
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, Number(finalFee));
        let psbt = new bitcoin.Psbt({ network: provider.network });
        if (fee === 0 && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee) {
                throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
            }
        }
        if (gatheredUtxos.totalAmount < finalFee) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
                    },
                });
            }
        }
        psbt.addOutput({
            value: 546,
            address: account.taproot.address,
        });
        const script = (0, index_js_1.encodeRunestoneProtostone)({
            protostones: [
                envelope.ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: envelope.encipher(calldata),
                }),
            ],
        }).encodedRunestone;
        const output = { script, value: 0 };
        psbt.addOutput(output);
        const changeAmount = gatheredUtxos.totalAmount - finalFee - 546;
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return {
            psbt: formattedPsbtTx.toBase64(),
            psbtHex: formattedPsbtTx.toHex(),
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createExecutePsbt = createExecutePsbt;
const createDeployCommit = async ({ gatheredUtxos, tweakedTaprootKeyPair, account, provider, feeRate, fee, }) => {
    try {
        const originalGatheredUtxos = gatheredUtxos;
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 2,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const calculatedFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        let finalFee = fee ? fee : calculatedFee;
        let psbt = new bitcoin.Psbt({ network: provider.network });
        const binary = new Uint8Array(Array.from(await fs_extra_1.default.readFile(path_1.default.join(__dirname, './', 'free_mint.wasm'))));
        const gzip = (0, util_1.promisify)(node_zlib_1.gzip);
        const payload = {
            body: await gzip(binary, { level: 9 }),
            cursed: false,
            tags: { contentType: '' },
        };
        const script = Buffer.from(envelope.p2tr_ord_reveal((0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey), [
            payload,
        ]).script);
        const inscriberInfo = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey),
            scriptTree: {
                output: script,
            },
            network: provider.network,
        });
        psbt.addOutput({
            value: 20000 + 546,
            address: inscriberInfo.address,
        });
        gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, 20000 + Number(utils_1.inscriptionSats));
        if (!fee && gatheredUtxos.utxos.length > 1) {
            const txSize = (0, btc_1.minimumFee)({
                taprootInputCount: gatheredUtxos.utxos.length,
                nonTaprootInputCount: 0,
                outputCount: 2,
            });
            finalFee = txSize * feeRate < 250 ? 250 : txSize * feeRate;
            if (gatheredUtxos.totalAmount < finalFee) {
                gatheredUtxos = (0, utils_1.findXAmountOfSats)(originalGatheredUtxos.utxos, 20000 + Number(utils_1.inscriptionSats));
            }
        }
        for (let i = 0; i < gatheredUtxos.utxos.length; i++) {
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 0) {
                const previousTxHex = await provider.esplora.getTxHex(gatheredUtxos.utxos[i].txId);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    nonWitnessUtxo: Buffer.from(previousTxHex, 'hex'),
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 2) {
                const redeemScript = bitcoin.script.compile([
                    bitcoin.opcodes.OP_0,
                    bitcoin.crypto.hash160(Buffer.from(account.nestedSegwit.pubkey, 'hex')),
                ]);
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    redeemScript: redeemScript,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: bitcoin.script.compile([
                            bitcoin.opcodes.OP_HASH160,
                            bitcoin.crypto.hash160(redeemScript),
                            bitcoin.opcodes.OP_EQUAL,
                        ]),
                    },
                });
            }
            if ((0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 1 ||
                (0, utils_2.getAddressType)(gatheredUtxos.utxos[i].address) === 3) {
                psbt.addInput({
                    hash: gatheredUtxos.utxos[i].txId,
                    index: gatheredUtxos.utxos[i].outputIndex,
                    witnessUtxo: {
                        value: gatheredUtxos.utxos[i].satoshis,
                        script: Buffer.from(gatheredUtxos.utxos[i].scriptPk, 'hex'),
                    },
                });
            }
        }
        if (gatheredUtxos.totalAmount < finalFee + utils_1.inscriptionSats) {
            throw new errors_1.OylTransactionError(Error('Insufficient Balance'));
        }
        const changeAmount = gatheredUtxos.totalAmount - (finalFee + 20000 + utils_1.inscriptionSats);
        psbt.addOutput({
            address: account[account.spendStrategy.changeAddress].address,
            value: changeAmount,
        });
        const formattedPsbtTx = await (0, utils_1.formatInputsToSign)({
            _psbt: psbt,
            senderPublicKey: account.taproot.pubkey,
            network: provider.network,
        });
        return { psbt: formattedPsbtTx.toBase64(), script };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createDeployCommit = createDeployCommit;
const createDeployReveal = async ({ createReserveNumber, receiverAddress, script, feeRate, tweakedTaprootKeyPair, provider, fee = 0, commitTxId, }) => {
    try {
        if (!feeRate) {
            feeRate = (await provider.esplora.getFeeEstimates())['1'];
        }
        const psbt = new bitcoin.Psbt({ network: provider.network });
        const minFee = (0, btc_1.minimumFee)({
            taprootInputCount: 1,
            nonTaprootInputCount: 0,
            outputCount: 2,
        });
        const revealTxBaseFee = minFee * feeRate < 250 ? 250 : minFee * feeRate;
        const revealTxChange = fee === 0 ? 0 : Number(revealTxBaseFee) - fee;
        const commitTxOutput = await (0, utils_1.getOutputValueByVOutIndex)({
            txId: commitTxId,
            vOut: 0,
            esploraRpc: provider.esplora,
        });
        if (!commitTxOutput) {
            throw new Error('Error getting vin #0 value');
        }
        const protostone = (0, index_js_1.encodeRunestoneProtostone)({
            protostones: [
                envelope.ProtoStone.message({
                    protocolTag: 1n,
                    edicts: [],
                    pointer: 0,
                    refundPointer: 0,
                    calldata: envelope.encipher([
                        BigInt(3),
                        BigInt(createReserveNumber),
                        BigInt(100),
                    ]),
                }),
            ],
        }).encodedRunestone;
        const p2pk_redeem = { output: script };
        const { output, witness } = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(tweakedTaprootKeyPair.publicKey),
            scriptTree: p2pk_redeem,
            redeem: p2pk_redeem,
            network: provider.network,
        });
        psbt.addInput({
            hash: commitTxId,
            index: 0,
            witnessUtxo: {
                value: commitTxOutput.value,
                script: output,
            },
            tapLeafScript: [
                {
                    leafVersion: bip341_1.LEAF_VERSION_TAPSCRIPT,
                    script: p2pk_redeem.output,
                    controlBlock: witness[witness.length - 1],
                },
            ],
        });
        psbt.addOutput({
            value: 546,
            address: receiverAddress,
        });
        psbt.addOutput({
            value: 0,
            script: protostone,
        });
        if (revealTxChange > 546) {
            psbt.addOutput({
                value: revealTxChange,
                address: receiverAddress,
            });
        }
        psbt.signInput(0, tweakedTaprootKeyPair);
        psbt.finalizeInput(0);
        return {
            psbt: psbt.toBase64(),
            psbtHex: psbt.extractTransaction().toHex(),
            fee: revealTxChange,
        };
    }
    catch (error) {
        throw new errors_1.OylTransactionError(error);
    }
};
exports.createDeployReveal = createDeployReveal;
const findAlkaneUtxos = async ({ address, greatestToLeast, provider, alkaneId, targetNumberOfAlkanes, }) => {
    const res = await provider.alkanes.getAlkanesByAddress({
        address: address,
        protocolTag: '1',
    });
    const matchingRunesWithOutpoints = res.flatMap((outpoint) => outpoint.runes
        .filter((value) => value.rune.id.block === alkaneId.block &&
        value.rune.id.tx === alkaneId.tx)
        .map((rune) => ({ rune, outpoint })));
    const sortedRunesWithOutpoints = matchingRunesWithOutpoints.sort((a, b) => greatestToLeast
        ? Number(b.rune.balance) - Number(a.rune.balance)
        : Number(a.rune.balance) - Number(b.rune.balance));
    let totalSatoshis = 0;
    let totalBalanceBeingSent = 0;
    const alkaneUtxos = [];
    for (const alkane of sortedRunesWithOutpoints) {
        if (totalBalanceBeingSent < targetNumberOfAlkanes) {
            const satoshis = Number(alkane.outpoint.output.value);
            alkaneUtxos.push({
                txId: alkane.outpoint.outpoint.txid,
                txIndex: alkane.outpoint.outpoint.vout,
                script: alkane.outpoint.output.script,
                address,
                amountOfAlkanes: alkane.rune.balance,
                satoshis,
            });
            totalSatoshis += satoshis;
            totalBalanceBeingSent +=
                Number(alkane.rune.balance) / 10 ** alkane.rune.rune.divisibility;
        }
        else {
            break;
        }
    }
    return { alkaneUtxos, totalSatoshis };
};
exports.findAlkaneUtxos = findAlkaneUtxos;
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
const actualDeployCommitFee = async ({ tweakedTaprootKeyPair, gatheredUtxos, account, provider, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createDeployCommit)({
        gatheredUtxos,
        tweakedTaprootKeyPair,
        account,
        provider,
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
    const { psbt: finalPsbt } = await (0, exports.createDeployCommit)({
        gatheredUtxos,
        tweakedTaprootKeyPair,
        account,
        provider,
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
exports.actualDeployCommitFee = actualDeployCommitFee;
const actualDeployRevealFee = async ({ createReserveNumber, tweakedTaprootKeyPair, commitTxId, receiverAddress, script, provider, feeRate, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbtHex } = await (0, exports.createDeployReveal)({
        createReserveNumber,
        commitTxId,
        receiverAddress,
        script,
        tweakedTaprootKeyPair,
        provider,
        feeRate,
    });
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([psbtHex]))[0].vsize;
    console.log(await provider.sandshrew.bitcoindRpc.testMemPoolAccept([psbtHex]));
    const correctFee = vsize * feeRate;
    console.log(correctFee);
    const { psbtHex: finalPsbtHex } = await (0, exports.createDeployReveal)({
        createReserveNumber,
        commitTxId,
        receiverAddress,
        script,
        tweakedTaprootKeyPair,
        provider,
        feeRate,
        fee: correctFee,
    });
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalPsbtHex]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualDeployRevealFee = actualDeployRevealFee;
const actualExecuteFee = async ({ gatheredUtxos, account, calldata, provider, feeRate, signer, }) => {
    if (!feeRate) {
        feeRate = (await provider.esplora.getFeeEstimates())['1'];
    }
    const { psbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        calldata,
        provider,
        feeRate,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: psbt,
        finalize: true,
    });
    let rawPsbt = bitcoin.Psbt.fromBase64(signedPsbt, {
        network: account.network,
    })
        .extractTransaction()
        .toHex();
    const vsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([rawPsbt]))[0].vsize;
    const correctFee = vsize * feeRate;
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        calldata,
        provider,
        feeRate,
        fee: correctFee,
    });
    const { signedPsbt: finalSignedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    let finalRawPsbt = bitcoin.Psbt.fromBase64(finalSignedPsbt, {
        network: account.network,
    })
        .extractTransaction()
        .toHex();
    const finalVsize = (await provider.sandshrew.bitcoindRpc.testMemPoolAccept([finalRawPsbt]))[0].vsize;
    const finalFee = finalVsize * feeRate;
    return { fee: finalFee };
};
exports.actualExecuteFee = actualExecuteFee;
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
const deployCommit = async ({ gatheredUtxos, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const { fee: commitFee } = await (0, exports.actualDeployCommitFee)({
        gatheredUtxos,
        tweakedTaprootKeyPair,
        account,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt, script } = await (0, exports.createDeployCommit)({
        gatheredUtxos,
        tweakedTaprootKeyPair,
        account,
        provider,
        feeRate,
        fee: commitFee,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const result = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return { ...result, script: script.toString('hex') };
};
exports.deployCommit = deployCommit;
const deployReveal = async ({ createReserveNumber, commitTxId, script, account, provider, feeRate, signer, }) => {
    const tweakedTaprootKeyPair = (0, utils_1.tweakSigner)(signer.taprootKeyPair, {
        network: provider.network,
    });
    const { fee } = await (0, exports.actualDeployRevealFee)({
        createReserveNumber,
        tweakedTaprootKeyPair,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
    });
    const { psbt: finalRevealPsbt } = await (0, exports.createDeployReveal)({
        createReserveNumber,
        tweakedTaprootKeyPair,
        receiverAddress: account.taproot.address,
        commitTxId,
        script: Buffer.from(script, 'hex'),
        provider,
        feeRate,
        fee,
    });
    const revealResult = await provider.pushPsbt({
        psbtBase64: finalRevealPsbt,
    });
    return revealResult;
};
exports.deployReveal = deployReveal;
const execute = async ({ gatheredUtxos, account, calldata, provider, feeRate, signer, }) => {
    const { fee } = await (0, exports.actualExecuteFee)({
        gatheredUtxos,
        account,
        calldata,
        provider,
        feeRate,
        signer,
    });
    const { psbt: finalPsbt } = await (0, exports.createExecutePsbt)({
        gatheredUtxos,
        account,
        calldata,
        provider,
        feeRate,
        fee,
    });
    const { signedPsbt } = await signer.signAllInputs({
        rawPsbt: finalPsbt,
        finalize: true,
    });
    const revealResult = await provider.pushPsbt({
        psbtBase64: signedPsbt,
    });
    return revealResult;
};
exports.execute = execute;
//# sourceMappingURL=alkanes.js.map