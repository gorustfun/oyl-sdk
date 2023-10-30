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
exports.Wallet = void 0;
const txbuilder_1 = require("./txbuilder");
const constants_1 = require("./shared/constants");
const utils_1 = require("./shared/utils");
const rpclient_1 = __importDefault(require("./rpclient"));
const transactions = __importStar(require("./transactions"));
const accounts_1 = require("./wallet/accounts");
const wallet_1 = require("./wallet");
const hdKeyring_1 = require("./wallet/hdKeyring");
const interface_1 = require("./shared/interface");
const apiclient_1 = require("./apiclient");
const bitcoin = __importStar(require("bitcoinjs-lib"));
const RequiredPath = [
    "m/44'/0'/0'/0",
    "m/49'/0'/0'/0",
    "m/84'/0'/0'/0",
    "m/86'/0'/0'/0", // P2TR (Taproot)
];
class Wallet {
    constructor() {
        this.apiClient = new apiclient_1.OylApiClient({ host: 'https://api.oyl.gg' });
        this.fromProvider();
        //create wallet should optionally take in a private key
        this.wallet = this.createWallet({});
    }
    static connect(provider) {
        try {
            const wallet = new this();
            wallet.rpcClient = provider;
            return wallet;
        }
        catch (e) {
            throw Error('An error occured: ' + e);
        }
    }
    fromProvider(options) {
        try {
            const clientOptions = {};
            clientOptions['network'] = (options === null || options === void 0 ? void 0 : options.network) || 'main';
            clientOptions['port'] = (options === null || options === void 0 ? void 0 : options.port) || 8332;
            clientOptions['host'] = (options === null || options === void 0 ? void 0 : options.host) || '172.31.17.134';
            clientOptions['apiKey'] = (options === null || options === void 0 ? void 0 : options.auth) || 'oylwell';
            switch (options === null || options === void 0 ? void 0 : options.provider) {
                case interface_1.Providers.bcoin:
                    this.rpcClient = new rpclient_1.default(clientOptions);
                default:
                    this.rpcClient = new rpclient_1.default(clientOptions);
            }
            return clientOptions;
        }
        catch (e) {
            throw Error('An error occured: ' + e);
        }
    }
    getAddressSummary({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            if (typeof address === 'string') {
                address = [address];
            }
            const addressesUtxo = [];
            for (let i = 0; i < address.length; i++) {
                let utxos = yield transactions.getUnspentOutputs(address[i]);
                //console.log(utxos)
                addressesUtxo[i] = {};
                addressesUtxo[i]['utxo'] = utxos.unspent_outputs;
                addressesUtxo[i]['balance'] = transactions.calculateBalance(utxos.unspent_outputs);
            }
            return addressesUtxo;
        });
    }
    getTaprootAddress({ publicKey }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const address = (0, accounts_1.publicKeyToAddress)(publicKey, interface_1.AddressType.P2TR);
                return address;
            }
            catch (err) {
                return err;
            }
        });
    }
    fromPhrase({ mnemonic, type = 'taproot', hdPath = RequiredPath[3] }) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                let addrType;
                switch (type) {
                    case 'taproot':
                        addrType = interface_1.AddressType.P2TR;
                        break;
                    case 'segwit':
                        addrType = interface_1.AddressType.P2WPKH;
                        break;
                    case 'legacy':
                        addrType = interface_1.AddressType.P2PKH;
                        break;
                    default:
                        addrType = interface_1.AddressType.P2TR;
                        break;
                }
                const wallet = yield wallet_1.accounts.importMnemonic(mnemonic, hdPath, addrType);
                this.wallet = wallet;
                const meta = yield this.getUtxosArtifacts({ address: wallet['address'] });
                const data = {
                    keyring: wallet,
                    assets: meta,
                };
                this.mnemonic = mnemonic;
                return data;
            }
            catch (err) {
                return err;
            }
        });
    }
    recoverWallet(options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const keyring = new hdKeyring_1.HdKeyring(options);
                //keyring.addAccounts(2)
                return keyring;
            }
            catch (error) {
                return error;
            }
        });
    }
    getSegwitAddress({ publicKey }) {
        return __awaiter(this, void 0, void 0, function* () {
            const address = (0, accounts_1.publicKeyToAddress)(publicKey, interface_1.AddressType.P2WPKH);
            return address;
        });
    }
    createWallet({ type }) {
        try {
            let hdPath;
            let addrType;
            switch (type) {
                case 'taproot':
                    addrType = interface_1.AddressType.P2TR;
                    hdPath = RequiredPath[3];
                    break;
                case 'segwit':
                    addrType = interface_1.AddressType.P2WPKH;
                    hdPath = RequiredPath[2];
                    break;
                case 'nested-segwit':
                    addrType = interface_1.AddressType.P2SH_P2WPKH;
                    hdPath = RequiredPath[1];
                case 'legacy':
                    addrType = interface_1.AddressType.P2PKH;
                    hdPath = RequiredPath[0];
                    break;
                default:
                    addrType = interface_1.AddressType.P2TR;
                    hdPath = RequiredPath[3];
                    break;
            }
            const wallet = wallet_1.accounts.createWallet(hdPath, addrType);
            return wallet;
        }
        catch (err) {
            return err;
        }
    }
    getMetaBalance({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            const addressSummary = yield this.getAddressSummary({ address });
            const confirmAmount = addressSummary.reduce((total, addr) => {
                const confirmedUtxos = addr.utxo.filter((utxo) => utxo.confirmations > 0);
                return (total + confirmedUtxos.reduce((sum, utxo) => sum + utxo.value / 1e8, 0));
            }, 0);
            const pendingAmount = addressSummary.reduce((total, addr) => {
                const unconfirmedUtxos = addr.utxo.filter((utxo) => utxo.confirmations === 0);
                return (total +
                    unconfirmedUtxos.reduce((sum, utxo) => sum + utxo.value / 1e8, 0));
            }, 0);
            const amount = confirmAmount + pendingAmount;
            const usdValue = yield transactions.convertUsdValue(amount);
            const response = {
                confirm_amount: confirmAmount.toFixed(8),
                pending_amount: pendingAmount.toFixed(8),
                amount: amount.toFixed(8),
                usd_value: usdValue,
            };
            return response;
        });
    }
    getTxHistory({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            const history = yield this.apiClient.getTxByAddress(address);
            const processedTransactions = history
                .map((tx) => {
                var _a;
                const { hash, height, time, outputs, inputs, confirmations, fee } = tx;
                const output = outputs.find((output) => output.address === address);
                const input = inputs.find((input) => input.coin.address === address);
                const txDetails = {};
                txDetails['hash'] = hash;
                txDetails['confirmations'] = confirmations;
                txDetails['blocktime'] = time;
                txDetails['blockheight'] = height;
                if (input) {
                    txDetails['type'] = 'sent';
                    txDetails['fee'] = fee;
                    txDetails['feeRate'] = fee / 140;
                    txDetails['to'] = (_a = outputs.find((output) => output.address != address)) === null || _a === void 0 ? void 0 : _a.address;
                    if (output) {
                        txDetails['amount'] = input.coin.value / 1e8 - output.value / 1e8;
                    }
                    else {
                        txDetails['amount'] = input.coin.value / 1e8;
                    }
                }
                else {
                    if (output) {
                        txDetails['type'] = 'received';
                        txDetails['amount'] = output.value / 1e8;
                        txDetails['fee'] = fee;
                        txDetails['feeRate'] = fee / 140;
                        txDetails['from'] = inputs.find((input) => input.coin.address != address).coin.address;
                    }
                }
                txDetails['symbol'] = 'BTC';
                return txDetails;
            })
                .filter((transaction) => transaction !== null); // Filter out null transactions
            return processedTransactions;
        });
    }
    getFees() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.apiClient.getFees();
        });
    }
    // async getActiveAddresses({ xpub, lookAhead = 10 }) {
    //   const childKeyB58 = bip32.fromBase58(xpub)
    //   const chain = new Chain(childKeyB58)
    //   const batch = [chain.get()] //get first at index 0
    //   let seenUnused = false
    //   //Check through each Address to see which one has been used
    //   while (batch.length < lookAhead && seenUnused === false) {
    //     chain.next()
    //     batch.push(chain.get())
    //     const res = await this.getAddressSummary({ address: batch })
    //     res.map(function (res) {
    //       if (res.balance > 0) {
    //         seenUnused = true
    //       }
    //     })
    //   }
    //   return batch
    // }
    getTotalBalance({ batch }) {
        return __awaiter(this, void 0, void 0, function* () {
            const res = yield this.getAddressSummary({ address: batch });
            let total = 0;
            res.forEach((element) => {
                total += element.balance;
            });
            return total;
        });
    }
    getInscriptions({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            const artifacts = yield this.apiClient.getCollectiblesByAddress(address);
            return artifacts.data.map((item) => {
                const { inscription_id, inscription_number, satpoint } = item;
                const detail = {
                    id: inscription_id,
                    address: item.owner_wallet_addr,
                    preview: `https://ordinals.com/preview/${inscription_id}`,
                    content: `https://ordinals.com/content/${inscription_id}`,
                    location: satpoint,
                };
                return {
                    id: inscription_id,
                    inscription_number,
                    detail,
                };
            });
        });
    }
    getUtxosArtifacts({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            const utxos = yield transactions.getUnspentOutputs(address);
            const inscriptions = yield this.getInscriptions({ address });
            const utxoArtifacts = yield transactions.getMetaUtxos(address, utxos.unspent_outputs, inscriptions);
            return utxoArtifacts;
        });
    }
    importWatchOnlyAddress({ addresses = [] }) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let i = 0; i < addresses.length; i++) {
                yield new Promise((resolve) => setTimeout(resolve, 10000));
                yield this.rpcClient.execute('importaddress', [addresses[i], '', true]);
            }
        });
    }
    /**
    *
    * Example implementation to send BTC DO NOT USE!!!
  
    async sendBtc({ mnemonic, to, amount, fee }) {
  
    const payload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: "m/49'/0'/0'",
      type: 'segwit',
    })
  
    const keyring = payload.keyring.keyring;
    const pubKey = keyring.wallets[0].publicKey.toString('hex');
    const signer = keyring.signTransaction.bind(keyring);
    const from = payload.keyring.address;
    const changeAddress = from;
  
  
    return await this.createPsbtTx({publicKey: pubKey, from: from, to: to, changeAddress: changeAddress, amount: amount, fee: fee,  signer: signer })
    }
  */
    /**
    *
    * Example implementation to send Ordinal DO NOT USE!!!
  
  async sendOrd({ mnemonic, to,  inscriptionId, inscriptionOffset, inscriptionOutputValue, fee }) {
    const payload = await this.fromPhrase({
      mnemonic: mnemonic.trim(),
      hdPath: "m/49'/0'/0'",
      type: 'segwit',
    })
    const keyring = payload.keyring.keyring;
    const pubKey = keyring.wallets[0].publicKey.toString('hex');
    const signer = keyring.signTransaction.bind(keyring);
    const from = payload.keyring.address;
    const changeAddress = from;
    return await this.createOrdPsbtTx({
      publicKey: pubKey,
      fromAddress: from,
      toAddress: to,
      changeAddress: changeAddress,
      txFee: fee,
      signer: signer,
      inscriptionId,
      metaOffset: inscriptionOffset,
      metaOutputValue: inscriptionOutputValue
    })
  }
  */
    createOrdPsbtTx({ publicKey, fromAddress, toAddress, changeAddress, txFee, signer, inscriptionId, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const { data: collectibleData } = yield this.apiClient.getCollectiblesById(inscriptionId);
            const metaOffset = collectibleData.satpoint.charAt(collectibleData.satpoint.length - 1);
            const metaOutputValue = collectibleData.output_value || 10000;
            const minOrdOutputValue = Math.max(metaOffset, constants_1.UTXO_DUST);
            if (metaOutputValue < minOrdOutputValue) {
                throw Error(`OutputValue must be at least ${minOrdOutputValue}`);
            }
            const allUtxos = yield this.getUtxosArtifacts({ address: fromAddress });
            const feeRate = txFee;
            const addressType = transactions.getAddressType(fromAddress);
            if (addressType == null)
                throw Error('Unrecognized Address Type');
            const psbtTx = new txbuilder_1.PSBTTransaction(signer, fromAddress, publicKey, addressType, feeRate);
            psbtTx.setChangeAddress(changeAddress);
            const finalizedPsbt = yield (0, txbuilder_1.buildOrdTx)(psbtTx, allUtxos, toAddress, metaOutputValue, inscriptionId);
            //@ts-ignore
            finalizedPsbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
            const rawtx = finalizedPsbt.extractTransaction().toHex();
            const result = yield this.apiClient.pushTx({ transactionHex: rawtx });
            return Object.assign({ txId: finalizedPsbt.extractTransaction().getId() }, result);
        });
    }
    createPsbtTx({ publicKey, from, to, changeAddress, amount, fee, signer, }) {
        return __awaiter(this, void 0, void 0, function* () {
            const utxos = yield this.getUtxosArtifacts({ address: from });
            const feeRate = fee;
            const addressType = transactions.getAddressType(from);
            if (addressType == null)
                throw Error('Invalid Address Type');
            const tx = new txbuilder_1.PSBTTransaction(signer, from, publicKey, addressType, feeRate);
            tx.addOutput(to, (0, utils_1.amountToSatoshis)(amount));
            tx.setChangeAddress(changeAddress);
            const outputAmount = tx.getTotalOutput();
            const nonOrdUtxos = [];
            const ordUtxos = [];
            utxos.forEach((v) => {
                if (v.inscriptions.length > 0) {
                    ordUtxos.push(v);
                }
                else {
                    nonOrdUtxos.push(v);
                }
            });
            let tmpSum = tx.getTotalInput();
            for (let i = 0; i < nonOrdUtxos.length; i++) {
                const nonOrdUtxo = nonOrdUtxos[i];
                if (tmpSum < outputAmount) {
                    tx.addInput(nonOrdUtxo);
                    tmpSum += nonOrdUtxo.satoshis;
                    continue;
                }
                const fee = yield tx.calNetworkFee();
                if (tmpSum < outputAmount + fee) {
                    tx.addInput(nonOrdUtxo);
                    tmpSum += nonOrdUtxo.satoshis;
                }
                else {
                    break;
                }
            }
            if (nonOrdUtxos.length === 0) {
                throw new Error('Balance not enough');
            }
            const totalUnspentAmount = tx.getUnspent();
            if (totalUnspentAmount === 0) {
                throw new Error('Balance not enough to pay network fee.');
            }
            // add dummy output
            tx.addChangeOutput(1);
            const estimatedNetworkFee = yield tx.calNetworkFee();
            if (totalUnspentAmount < estimatedNetworkFee) {
                throw new Error(`Not enough balance. Need ${(0, utils_1.satoshisToAmount)(estimatedNetworkFee)} BTC as network fee, but only ${(0, utils_1.satoshisToAmount)(totalUnspentAmount)} BTC is available.`);
            }
            const remainingBalance = totalUnspentAmount - estimatedNetworkFee;
            if (remainingBalance >= constants_1.UTXO_DUST) {
                // change dummy output to true output
                tx.getChangeOutput().value = remainingBalance;
            }
            else {
                // remove dummy output
                tx.removeChangeOutput();
            }
            const psbt = yield tx.createSignedPsbt();
            tx.dumpTx(psbt);
            //@ts-ignore
            psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
            const rawtx = psbt.extractTransaction().toHex();
            // console.log("rawtx", rawtx)
            const result = yield this.apiClient.pushTx({ transactionHex: rawtx });
            // console.log(result)
            return Object.assign({ txId: psbt.extractTransaction().getId() }, result);
        });
    }
    getSegwitAddressInfo({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            const isValid = transactions.validateSegwitAddress({
                address,
                type: 'segwit',
            });
            if (!isValid) {
                return { isValid, summary: null };
            }
            const summary = yield this.getAddressSummary({ address });
            return { isValid, summary };
        });
    }
    getTaprootAddressInfo({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            const isValid = transactions.validateTaprootAddress({
                address,
                type: 'segwit',
            });
            if (!isValid) {
                return { isValid, summary: null };
            }
            const summary = yield this.getAddressSummary({ address });
            return { isValid, summary };
        });
    }
    getBrcOffers({ ticker }) {
        return __awaiter(this, void 0, void 0, function* () {
            const offers = yield this.apiClient.getTickerOffers({ _ticker: ticker });
            return offers;
        });
    }
    swapBrc(bid) {
        return __awaiter(this, void 0, void 0, function* () {
            const psbt = yield this.apiClient.initSwapBid({
                address: bid.address,
                auctionId: bid.auctionId,
                bidPrice: bid.bidPrice,
                pubKey: bid.pubKey,
            });
            if (psbt.error)
                return psbt;
            const unsignedPsbt = psbt.psbtBid;
            const feeRate = psbt.feeRate;
            const swapOptions = bid;
            swapOptions['psbt'] = unsignedPsbt;
            swapOptions['feeRate'] = feeRate;
            const signedPsbt = yield this.swapFlow(swapOptions);
            const txId = yield this.apiClient.submitSignedBid({
                psbtBid: signedPsbt,
                auctionId: bid.auctionId,
                bidId: psbt.bidId,
            });
            return txId;
        });
    }
    swapFlow(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const address = options.address;
            const feeRate = options.feeRate;
            const mnemonic = options.mnemonic;
            const pubKey = options.pubKey;
            const psbt = bitcoin.Psbt.fromHex(options.psbt, {
                network: bitcoin.networks.bitcoin,
            });
            const wallet = new Wallet();
            const payload = yield wallet.fromPhrase({
                mnemonic: mnemonic.trim(),
                hdPath: options.hdPath,
                type: options.type,
            });
            const keyring = payload.keyring.keyring;
            const signer = keyring.signTransaction.bind(keyring);
            const from = address;
            const addressType = transactions.getAddressType(from);
            if (addressType == null)
                throw Error('Invalid Address Type');
            const tx = new txbuilder_1.PSBTTransaction(signer, from, pubKey, addressType, feeRate);
            const psbt_ = yield tx.signPsbt(psbt, false);
            return psbt_.toHex();
        });
    }
    listBrc20s({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.apiClient.getBrc20sByAddress(address);
        });
    }
    listCollectibles({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.apiClient.getCollectiblesByAddress(address);
        });
    }
}
exports.Wallet = Wallet;
//# sourceMappingURL=oylib.js.map