"use strict";
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
exports.OylApiClient = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
/**
 * Represents the client for interacting with the Oyl API.
 */
class OylApiClient {
    /**
     * Create an instance of the OylApiClient.
     * @param options - Configuration object containing the API host.
     */
    constructor(options) {
        this.host = (options === null || options === void 0 ? void 0 : options.host) || '';
    }
    /**
     * Create an instance of the OylApiClient from a plain object.
     * @param data - The data object.
     * @returns An instance of OylApiClient.
     */
    static fromObject(data) {
        return new this(data);
    }
    /**
     * Convert this OylApiClient instance to a plain object.
     * @returns The plain object representation.
     */
    toObject() {
        return {
            host: this.host,
        };
    }
    _call(path, method, data) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const options = {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                };
                if (['post', 'put', 'patch'].includes(method)) {
                    options.body = JSON.stringify(data);
                }
                const response = yield (0, node_fetch_1.default)(`${this.host}${path}`, options);
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return yield response.json();
            }
            catch (err) {
                throw err;
            }
        });
    }
    /**
     * Import an address to the Oyl API.
     * @param address - The address to be imported.
     */
    importAddress({ address }) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/import-address', 'post', { address });
        });
    }
    /**
     * Push a transaction.
     * @param transactionHex - The hex of the transaction.
     */
    pushTx({ transactionHex }) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/broadcast-transaction', 'post', {
                transactionHex,
            });
        });
    }
    /**
     * Get transactions by address.
     * @param address - The address to query.
     */
    getTxByAddress(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/address-transactions', 'post', { address });
        });
    }
    /**
     * Get transactions by hash.
     * @param address - The hash to query.
     */
    getTxByHash(hash) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/hash-transactions', 'post', {
                hash: hash,
            });
        });
    }
    /**
     * Get brc20 info by ticker.
     * @param ticker - The hash to query.
     */
    getBrc20TokenInfo(ticker) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/get-brc20-token-info', 'post', {
                ticker: ticker,
            });
        });
    }
    /**
     * Get Brc20 balances by address.
     * @param address - The address to query.
     */
    getBrc20sByAddress(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/get-address-brc20-balance', 'post', {
                address: address,
            });
        });
    }
    /**
     * Get collectible by ID.
     * @param id - The ID of the collectible.
     */
    getCollectiblesById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/get-inscription-info', 'post', {
                inscription_id: id,
            });
        });
    }
    /**
     * Get collectibles by address.
     * @param address - The address to query.
     */
    getCollectiblesByAddress(address) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/get-inscriptions', 'post', {
                address: address,
                exclude_brc20: false,
            });
        });
    }
    /**
     * List wallets.
     */
    listWallet() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/list-wallets', 'get');
        });
    }
    /**
     * List transactions.
     */
    listTx() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/list-tx', 'get');
        });
    }
    /**
     * Get raw mempool.
     */
    getRawMempool() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/mempool', 'get');
        });
    }
    /**
     * Get mempool information.
     */
    getMempoolInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/mempool-info', 'get');
        });
    }
    /**
     * Get ticker offers.
     * @param _ticker - The ticker to query.
     */
    getTickerOffers({ _ticker }) {
        return __awaiter(this, void 0, void 0, function* () {
            const response = yield this._call('/get-token-offers', 'post', {
                ticker: _ticker,
            });
            return response.data.list;
        });
    }
    /**
     * Initialize a swap bid.
     * @param params - Parameters for the bid.
     */
    initSwapBid(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/initiate-bid', 'post', params);
        });
    }
    /**
     * Submit a signed bid.
     * @param params - Parameters for the signed bid.
     */
    submitSignedBid(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/finalize-bid', 'post', params);
        });
    }
    /**
     * Get transaction fees.
     */
    getFees() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/get-fees', 'get');
        });
    }
    /**
     * Subscribe for notifications.
     * @param webhookUrl - The URL to send notifications.
     * @param rbf - Replace-by-fee flag.
     */
    subscribe({ webhookUrl, rbf = false, }) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this._call('/subscribe-webhook', 'post', {
                webhookUrl,
                rbf,
            });
        });
    }
    /**
     * Import an address and subscribe for notifications.
     * @param address - The address to be imported.
     * @param webhookUrl - The URL to send notifications.
     * @param rbf - Replace-by-fee flag.
     */
    importSubscribe({ address, webhookUrl, rbf, }) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.importAddress({ address });
            yield this.subscribe({ webhookUrl, rbf });
        });
    }
}
exports.OylApiClient = OylApiClient;
//# sourceMappingURL=index.js.map