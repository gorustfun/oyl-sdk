"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCLI = exports.createInscriptionScript = exports.MEMPOOL_SPACE_API_V1_URL = exports.callAPI = exports.convertPsbt = exports.viewPsbt = exports.testAggregator = exports.testMarketplaceBuy = exports.loadRpc = void 0;
const yargs_1 = __importDefault(require("yargs"));
const change_case_1 = require("change-case");
require("dotenv/config");
const oylib_1 = require("../oylib");
const PSBTAggregator_1 = require("../PSBTAggregator");
const bitcoin = __importStar(require("bitcoinjs-lib"));
const axios_1 = __importDefault(require("axios"));
const ecc2 = __importStar(require("@bitcoinerlab/secp256k1"));
const helpers_1 = require("yargs/helpers");
const buildMarketplaceTx_1 = require("../marketplace/buildMarketplaceTx");
const utils_1 = require("../shared/utils");
const accountsManager_1 = require("../wallet/accountsManager");
const transactions = __importStar(require("../transactions"));
const marketplace_1 = require("../marketplace");
bitcoin.initEccLib(ecc2);
function loadRpc(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const wallet = new oylib_1.Oyl();
        try {
            const newWallet = yield wallet.sandshrewBtcClient.bitcoindRpc.decodePSBT(process.env.PSBT_BASE64);
            console.log('newWallet:', JSON.stringify(newWallet));
        }
        catch (error) {
            console.error('Error:', error);
        }
    });
}
exports.loadRpc = loadRpc;
function testMarketplaceBuy() {
    return __awaiter(this, void 0, void 0, function* () {
        const initOptions = {
            baseUrl: 'https://testnet.sandshrew.io',
            version: 'v1',
            projectId: 'd6aebfed1769128379aca7d215f0b689',
            network: 'testnet',
        };
        const wallet = new oylib_1.Oyl(initOptions);
        const marketplaceOptions = {
            address: process.env.TESTNET_TAPROOT_ADDRESS,
            publicKey: process.env.TESTNET_TAPROOT_PUBKEY,
            mnemonic: process.env.TESTNET_TAPROOT_MNEMONIC,
            hdPath: process.env.TESTNET_TAPROOT_HDPATH,
            feeRate: parseFloat(process.env.FEE_RATE),
            wallet: wallet,
        };
        const quotes = [
            {
                offerId: '65afed54d45a352ea5a48ec0',
                marketplace: 'omnisat',
                ticker: 'xing',
            },
            {
                offerId: '65b1560b3a76022313d73a40',
                marketplace: 'omnisat',
                ticker: 'xing',
            },
        ];
        const marketplace = new marketplace_1.Marketplace(marketplaceOptions);
        const offersToBuy = yield marketplace.processAllOffers(quotes);
        const signedTxs = yield marketplace.buyMarketPlaceOffers(offersToBuy);
        console.log(signedTxs);
    });
}
exports.testMarketplaceBuy = testMarketplaceBuy;
function testAggregator() {
    return __awaiter(this, void 0, void 0, function* () {
        const aggregator = new PSBTAggregator_1.Aggregator();
        const aggregated = yield aggregator.fetchAndAggregateOffers('ordi', 20, 110000);
        const formatOffers = (offers) => offers.map((offer) => ({
            amount: offer.amount,
            unitPrice: offer.unitPrice,
            nftId: offer.offerId,
            marketplace: offer.marketplace,
        }));
        console.log('Aggregated Offers');
        console.log('Best Price Offers:', formatOffers(aggregated.bestPrice.offers));
        console.log('Closest Match Offers:', formatOffers(aggregated.closestMatch.offers));
    });
}
exports.testAggregator = testAggregator;
function viewPsbt() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(bitcoin.Psbt.fromBase64(process.env.PSBT_BASE64, {
            network: bitcoin.networks.bitcoin,
        }).data.inputs);
    });
}
exports.viewPsbt = viewPsbt;
function convertPsbt() {
    return __awaiter(this, void 0, void 0, function* () {
        const psbt = bitcoin.Psbt.fromHex(process.env.PSBT_HEX, {
            network: bitcoin.networks.bitcoin,
        }).toBase64();
        console.log(psbt);
        console.log(bitcoin.Psbt.fromBase64(psbt, {
            network: bitcoin.networks.bitcoin,
        }).data.inputs);
    });
}
exports.convertPsbt = convertPsbt;
function callAPI(command, data, options = {}) {
    return __awaiter(this, void 0, void 0, function* () {
        const oylSdk = new oylib_1.Oyl();
        const camelCommand = (0, change_case_1.camelCase)(command);
        if (!oylSdk[camelCommand])
            throw Error('command not foud: ' + camelCommand);
        const result = yield oylSdk[camelCommand](data);
        console.log(JSON.stringify(result, null, 2));
        return result;
    });
}
exports.callAPI = callAPI;
exports.MEMPOOL_SPACE_API_V1_URL = 'https://mempool.space/api/v1';
const createInscriptionScript = (pubKey, content) => {
    const mimeType = 'text/plain;charset=utf-8';
    const textEncoder = new TextEncoder();
    const marker = textEncoder.encode('ord');
    return [
        pubKey,
        'OP_CHECKSIG',
        'OP_0',
        'OP_IF',
        marker,
        '01',
        textEncoder.encode(mimeType),
        'OP_0',
        textEncoder.encode(content),
        'OP_ENDIF',
    ];
};
exports.createInscriptionScript = createInscriptionScript;
const INSCRIPTION_PREPARE_SAT_AMOUNT = 4000;
const tapWallet = new oylib_1.Oyl({
    network: 'mainnet',
    baseUrl: 'https://mainnet.sandshrew.io',
    version: 'v1',
    projectId: 'd6aebfed1769128379aca7d215f0b689',
});
const testWallet = new oylib_1.Oyl({
    network: 'testnet',
    baseUrl: 'https://testnet.sandshrew.io',
    version: 'v1',
    projectId: 'd6aebfed1769128379aca7d215f0b689',
});
const XVERSE = 'xverse';
const UNISAT = 'unisat';
const MAINNET = 'mainnet';
const TESTNET = 'testnet';
const config = {
    [MAINNET]: {
        mnemonic: 'rich baby hotel region tape express recipe amazing chunk flavor oven obtain',
        wallet: tapWallet,
        taprootAddress: 'bc1ppkyawqh6lsgq4w82azgvht6qkd286mc599tyeaw4lr230ax25wgqdcldtm',
        taprootPubkey: '02ebb592b5f1a2450766487d451f3a6fb2a584703ef64c6acb613db62797f943be',
        segwitAddress: '3By5YxrxR7eE32ANZSA1Cw45Bf7f68nDic',
        segwitPubKey: '03ad1e146771ae624b49b463560766f5950a9341964a936ae6bf1627fda8d3b83b',
        destinationTaprootAddress: 'bc1p5pvvfjtnhl32llttswchrtyd9mdzd3p7yps98tlydh2dm6zj6gqsfkmcnd',
        feeRate: 25,
    },
    [TESTNET]: {
        mnemonic: 'dad wall sand scissors evil second elbow possible hour elbow recipe dinosaur',
        wallet: testWallet,
        taprootAddress: 'tb1p7ncck66wthnjl2clcry46f2uxjcn8naw95e6r8ag0x9zremx00lqmpzpkk',
        taprootPubkey: '021953423299016db2541eea62268f5461fadbaa904b22955dd9b12322e920db33',
        segwitAddress: 'tb1q9fflqu0ll6qnkcvlyc4dp4lpa4806gunlsvcnc',
        segwitPubKey: '031cee6c58c8f2bc98cfddb4fa182b03603503b5b5d121170d28a5f3e250123343',
        destinationTaprootAddress: 'tb1p5pvvfjtnhl32llttswchrtyd9mdzd3p7yps98tlydh2dm6zj6gqs77dhfz',
        feeRate: 1,
    },
};
const argv = (0, yargs_1.default)((0, helpers_1.hideBin)(process.argv))
    .usage('Usage: $0 <command> [options]')
    .option('network', {
    alias: 'n',
    describe: 'Choose network type',
    choices: ['mainnet', 'testnet'],
    default: 'testnet',
})
    .command('load', 'Load RPC command', {})
    .command('send', 'Send btc', (yargs) => {
    return yargs
        .option('to', {
        alias: 't',
        describe: 'Destination address for the transaction',
        type: 'string',
        default: config[yargs.argv['network']].destinationTaprootAddress,
    })
        .option('amount', {
        alias: 'a',
        describe: 'Amount of currency to send',
        type: 'number',
        default: 600,
    })
        .option('feeRate', {
        alias: 'f',
        describe: 'Fee rate for the transaction',
        type: 'number',
        default: config[yargs.argv['network']].feeRate,
    })
        .option('mnemonic', {
        describe: 'Mnemonic for the wallet',
        type: 'string',
        default: config[yargs.argv['network']].mnemonic,
    })
        .help().argv;
})
    .command('send-brc-20', 'Send BRC20 tokens', (yargs) => {
    return yargs
        .option('to', {
        alias: 't',
        describe: 'Destination address for the brc-20',
        type: 'string',
        default: config[yargs.argv['network']].destinationTaprootAddress,
    })
        .option('ticker', {
        alias: 'tik',
        describe: 'brc-20 ticker to send',
        type: 'string',
        demandOption: true,
    })
        .option('amount', {
        alias: 'a',
        describe: 'Amount of brc-20 to send',
        type: 'number',
        default: 5,
        demandOption: true,
    })
        .option('feeRate', {
        alias: 'f',
        describe: 'Fee rate for the transaction',
        type: 'number',
        default: config[yargs.argv['network']].feeRate,
    })
        .option('mnemonic', {
        describe: 'Mnemonic for the wallet',
        type: 'string',
        default: config[yargs.argv['network']].mnemonic,
    })
        .option('isDry', {
        describe: 'Dry run',
        type: 'string',
        default: false,
    })
        .help().argv;
})
    .command('send-collectible', 'Send a collectible', (yargs) => {
    return yargs
        .option('to', {
        alias: 't',
        describe: 'Destination address for the collectible',
        type: 'string',
        default: config[yargs.argv['network']].destinationTaprootAddress,
    })
        .option('inscriptionId', {
        alias: 'ixId',
        describe: 'Inscription to be sent',
        type: 'string',
        demandOption: true,
    })
        .option('feeRate', {
        alias: 'f',
        describe: 'Fee rate for the transaction',
        type: 'number',
        default: config[yargs.argv['network']].feeRate,
    })
        .option('mnemonic', {
        describe: 'Mnemonic for the wallet',
        type: 'string',
        default: config[yargs.argv['network']].mnemonic,
    })
        .option('isDry', {
        describe: 'Dry run',
        type: 'boolean',
        default: false,
    })
        .help().argv;
})
    .command('view', 'View PSBT', {})
    .command('convert', 'Convert PSBT', {})
    .command('aggregate', 'Test Aggregator', {})
    .command('create-offer', 'create an offer in the omnisat offers api', (yargs) => {
    return yargs
        .option('ticker', {
        describe: "ticker of brc-20 you'd like to sell",
        alias: 't',
        type: 'string',
        demandOption: true,
    })
        .option('amount', {
        describe: "the number of brc-20 tokens you're selling",
        type: 'number',
        demandOption: true,
    })
        .option('feeRate', {
        alias: 'f',
        describe: 'Fee rate for the transaction',
        type: 'number',
        default: config[yargs.argv['network']].feeRate,
    })
        .option('price', {
        describe: 'the price of the offer in sats',
        type: 'number',
        demandOption: true,
    })
        .help().argv;
})
    .command('buy-offer', 'buy and offer from the omnisat offers api', (yargs) => {
    return yargs
        .option('psbtBase64', {
        describe: 'offer psbt base64',
        alias: 'p',
        type: 'string',
        demandOption: true,
    })
        .option('feeRate', {
        alias: 'f',
        describe: 'Fee rate for the transaction',
        type: 'number',
        default: config[yargs.argv['network']].feeRate,
    })
        .help().argv;
})
    .command('aggregate', 'aggregate offers based on ticker', (yargs) => {
    return yargs
        .option('ticker', {
        describe: "ticker of brc-20 you'd like to sell",
        alias: 't',
        type: 'string',
        demandOption: true,
    })
        .option('feeRate', {
        alias: 'f',
        describe: 'Fee rate for the transaction',
        type: 'number',
        default: config[yargs.argv['network']].feeRate,
    })
        .option('price', {
        describe: 'the price of the offer in sats',
        type: 'number',
        // demandOption: true,
    })
        .help().argv;
})
    .command('txn-history', 'Transaction history', {})
    .command('gen-testnet-wallet', 'Generate testnet wallet', {})
    .demandCommand(1, 'You need at least one command before moving on')
    .help().argv;
function runCLI() {
    var _a;
    return __awaiter(this, void 0, void 0, function* () {
        const [command] = argv._;
        const { _, network = TESTNET } = yargs_1.default.argv;
        const options = Object.assign({}, yargs_1.default.argv);
        const networkConfig = config[network];
        let segwitSigner;
        const taprootSigner = yield tapWallet.createTaprootSigner({
            mnemonic: networkConfig.mnemonic,
            taprootAddress: networkConfig.taprootAddress,
        });
        // const wallet = generateWallet(true, networkConfig.mnemonic)
        // return
        const { mnemonic, to, amount, feeRate, isDry, ticker, psbtBase64, price } = options;
        switch (command) {
            case 'load':
                return yield loadRpc(options);
            case 'buy':
                return yield testMarketplaceBuy();
            case 'send':
                const sendResponse = yield networkConfig.wallet.sendBtc({
                    mnemonic,
                    to,
                    from: networkConfig.taprootAddress,
                    publicKey: networkConfig.taprootPubkey,
                    amount,
                    feeRate,
                });
                console.log(sendResponse);
                return sendResponse;
            case 'send-brc-20':
                const sendBrc20Response = yield networkConfig.wallet.sendBRC20({
                    mnemonic,
                    fromAddress: networkConfig.taprootAddress,
                    taprootPublicKey: networkConfig.taprootPubkey,
                    destinationAddress: to,
                    token: ticker,
                    amount,
                    feeRate,
                    isDry,
                });
                console.log(sendBrc20Response);
                return sendBrc20Response;
            case 'send-collectible':
                const { inscriptionId } = options;
                const sendInscriptionResponse = yield networkConfig.wallet.sendOrdCollectible({
                    mnemonic: networkConfig.mnemonic,
                    fromAddress: networkConfig.taprootAddress,
                    taprootPublicKey: networkConfig.taprootPubkey,
                    destinationAddress: networkConfig.destinationTaprootAddress,
                    inscriptionId,
                    feeRate,
                    isDry,
                });
                console.log(sendInscriptionResponse);
                return sendInscriptionResponse;
            case 'create-offer':
                try {
                    const taprootUtxos = yield networkConfig.wallet.getUtxosArtifacts({
                        address: networkConfig.taprootAddress,
                    });
                    const path = (_a = networkConfig.segwitHdPath) !== null && _a !== void 0 ? _a : 'oyl';
                    const hdPaths = accountsManager_1.customPaths[path];
                    const taprootPrivateKey = yield networkConfig.wallet.fromPhrase({
                        mnemonic: networkConfig.mnemonic,
                        addrType: transactions.getAddressType(networkConfig.taprootAddress),
                        hdPath: hdPaths['taprootPath'],
                    });
                    const content = `{"p":"brc-20","op":"transfer","tick":"${ticker}","amt":"${amount}"}`;
                    const { txId } = yield (0, utils_1.inscribe)({
                        content,
                        inputAddress: networkConfig.taprootAddress,
                        outputAddress: networkConfig.taprootAddress,
                        mnemonic: networkConfig.mnemonic,
                        taprootPublicKey: networkConfig.taprootPubkey,
                        segwitPublicKey: networkConfig.segwitPubKey,
                        segwitAddress: networkConfig.segwitAddress,
                        isDry: networkConfig.isDry,
                        segwitSigner: segwitSigner,
                        taprootSigner: taprootSigner,
                        feeRate: feeRate,
                        network: network,
                        taprootUtxos: taprootUtxos,
                        taprootPrivateKey: taprootPrivateKey.keyring.keyring._index2wallet[0][1].privateKey.toString('hex'),
                        sandshrewBtcClient: networkConfig.wallet.sandshrewBtcClient,
                        esploraRpc: networkConfig.wallet.esploraRpc,
                    });
                    console.log({ txId });
                    console.log("WAITING FOR UNISAT TO INDEX THE INSCRIPTION'S UTXO");
                    yield (0, utils_1.delay)(15000);
                    console.log('DONE WAITING');
                    const body = {
                        address: networkConfig.taprootAddress,
                        ticker,
                        amount: amount.toString(),
                        transferableInscription: {
                            inscription_id: `${txId}i0`,
                            ticker,
                            transfer_amount: amount.toString(),
                            is_valid: true,
                            is_used: false,
                            satpoint: `${txId}:0:0`,
                            min_price: null,
                            min_unit_price: null,
                            ordinalswallet_price: null,
                            ordinalswallet_unit_price: null,
                            unisat_price: null,
                            unisat_unit_price: null,
                        },
                        price: Number(price),
                    };
                    const OMNISAT_API_URL = 'https://omnisat-fe-git-testnet-omnisat-foundation.vercel.app/api';
                    const { psbtBase64, psbtHex } = yield axios_1.default
                        .post(`${OMNISAT_API_URL}/orders/create`, body, {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                        .then((res) => res.data)
                        .catch((error) => console.error('Error:', error));
                    const psbtToSign = bitcoin.Psbt.fromBase64(psbtBase64);
                    const toSignInputs = yield (0, utils_1.formatOptionsToSignInputs)({
                        _psbt: psbtToSign,
                        pubkey: networkConfig.taprootPubkey,
                        segwitPubkey: networkConfig.segwitPubKey,
                        segwitAddress: networkConfig.segwitAddress,
                        taprootAddress: networkConfig.taprootAddress,
                        network: (0, utils_1.getNetwork)(network),
                    });
                    const signedSendPsbt = yield (0, utils_1.signInputs)(psbtToSign, toSignInputs, networkConfig.taprootPubkey, networkConfig.segwitPubKey, segwitSigner, taprootSigner);
                    signedSendPsbt.finalizeInput(2);
                    console.log({
                        signedSendPsbt: signedSendPsbt.toBase64(),
                        signedSendPsbtHex: signedSendPsbt.toHex(),
                    });
                    const updateBody = {
                        psbtBase64: signedSendPsbt.toBase64(),
                        psbtHex: signedSendPsbt.toHex(),
                        satpoint: txId + ':0:0',
                    };
                    const updateResponse = yield axios_1.default
                        .put(`${OMNISAT_API_URL}/orders/create`, updateBody, {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    })
                        .then((res) => res.data)
                        .catch((error) => console.error('Error:', error));
                    console.log({ updateResponse });
                    return updateResponse;
                }
                catch (error) {
                    console.error(error);
                    return;
                }
            case 'buy-offer':
                try {
                    const orderToBeBought = bitcoin.Psbt.fromBase64(psbtBase64);
                    const price = orderToBeBought.txOutputs[2].value;
                    const marketplace = new buildMarketplaceTx_1.BuildMarketplaceTransaction({
                        address: networkConfig.taprootAddress,
                        price: price,
                        psbtBase64: psbtBase64,
                        pubKey: networkConfig.taprootPubkey,
                        wallet: networkConfig.wallet,
                    });
                    if (!(yield marketplace.isWalletPrepared())) {
                        console.log('WALLET NOT PREPARED');
                        const { psbtBase64: preparedPsbtBase64 } = yield marketplace.prepareWallet();
                        const preparationUtxo = bitcoin.Psbt.fromBase64(preparedPsbtBase64);
                        const toSignInputs = yield (0, utils_1.formatOptionsToSignInputs)({
                            _psbt: preparationUtxo,
                            pubkey: networkConfig.taprootPubkey,
                            segwitPubkey: networkConfig.segwitPubKey,
                            segwitAddress: networkConfig.segwitAddress,
                            taprootAddress: networkConfig.fromAddress,
                            network: (0, utils_1.getNetwork)(network),
                        });
                        const signedSendPsbt = yield (0, utils_1.signInputs)(preparationUtxo, toSignInputs, networkConfig.taprootPubkey, networkConfig.segwitPubKey, segwitSigner, taprootSigner);
                        signedSendPsbt.finalizeAllInputs();
                        const extractedTx = signedSendPsbt.extractTransaction().toHex();
                        console.log({ extractedTx });
                        return;
                    }
                    else {
                        console.log('WALLET PREPARED');
                        console.log('WALLET PREPARED');
                        console.log('WALLET PREPARED');
                        console.log('WALLET PREPARED');
                        console.log('WALLET PREPARED');
                    }
                    const { psbtHex: buildOrderHex, psbtBase64: builtOrderBase64 } = yield marketplace.psbtBuilder();
                    console.log({ builtOrderBase64 });
                    const filledOrderPsbt = bitcoin.Psbt.fromBase64(builtOrderBase64);
                    const toSignInputs = yield (0, utils_1.formatOptionsToSignInputs)({
                        _psbt: filledOrderPsbt,
                        pubkey: networkConfig.taprootPubkey,
                        segwitPubkey: networkConfig.segwitPubKey,
                        segwitAddress: networkConfig.segwitAddress,
                        taprootAddress: networkConfig.taprootAddress,
                        network: (0, utils_1.getNetwork)(network),
                    });
                    const signedSendPsbt = yield (0, utils_1.signInputs)(filledOrderPsbt, toSignInputs, networkConfig.taprootPubkey, networkConfig.segwitPubKey, segwitSigner, taprootSigner);
                    signedSendPsbt.finalizeInput(0);
                    signedSendPsbt.finalizeInput(1);
                    signedSendPsbt.finalizeInput(3);
                    const extractedTx = signedSendPsbt.extractTransaction().toHex();
                    console.log({ signedSendPsbt: signedSendPsbt.toBase64() });
                    console.log({ extractedTx });
                    const { result: offerBuyTxId, error: inscriptionError } = yield (0, utils_1.callBTCRPCEndpoint)('sendrawtransaction', extractedTx, network);
                    console.log({ offerBuyTxId, inscriptionError });
                    return offerBuyTxId;
                }
                catch (error) {
                    console.error(error);
                    return;
                }
            // case 'view':
            //   return await viewPsbt()
            // // case 'market':
            // //   return await testMarketplaceBuy()
            // //   break
            // case 'convert':
            //   return await convertPsbt()
            case 'aggregate':
                const aggregator = new PSBTAggregator_1.Aggregator();
                const aggregated = yield aggregator.fetchAndAggregateOffers(ticker, 20, 1000);
                const formatOffers = (offers) => offers.map((offer) => ({
                    amount: offer.amount,
                    unitPrice: offer.unitPrice,
                    nftId: offer.offerId,
                    marketplace: offer.marketplace,
                }));
                console.log('Aggregated Offers');
                console.log('Best Price Offers:', formatOffers(aggregated.bestPrice.offers));
                console.log('Closest Match Offers:', formatOffers(aggregated.closestMatch.offers));
                return;
            case 'account-summary':
                return console.log(yield networkConfig.wallet.getAddressSummary({
                    address: networkConfig.taprootAddress,
                }));
            // case 'txn-history':
            //   const test = new Oyl()
            //   return await test.getTxHistory({
            //     addresses: [networkConfig.taprootAddress, networkConfig.segwitAddress],
            //   })
            case 'taproot-txn-history':
                return console.log(yield networkConfig.wallet.getTaprootTxHistory({
                    taprootAddress: networkConfig.taprootAddress,
                }));
            default:
                return yield callAPI(argv._[0], options);
        }
    });
}
exports.runCLI = runCLI;
//# sourceMappingURL=cli.js.map