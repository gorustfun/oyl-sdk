import { SwapBrcBid, SignedBid } from '../shared/interface';
export declare class OylApiClient {
    private host;
    constructor(options?: any);
    static fromObject(data: any): OylApiClient;
    toObject(): {
        host: String;
    };
    _call(path: string, method: string, data?: any): Promise<any>;
    catch(err: any): any;
    importAddress({ address }: {
        address: String;
    }): Promise<any>;
    pushTx({ transactionHex }: {
        transactionHex: String;
    }): Promise<any>;
    getTxByAddress(address: string): Promise<any>;
    getBrc20sByAddress(address: string): Promise<any>;
    getCollectiblesById(id: string): Promise<any>;
    getCollectiblesByAddress(address: string): Promise<any>;
    listWallet(): Promise<any>;
    listTx(): Promise<any>;
    getRawMempool(): Promise<any>;
    getMempoolInfo(): Promise<any>;
    getTickerOffers({ _ticker }: {
        _ticker: String;
    }): Promise<any>;
    initSwapBid({ address, auctionId, bidPrice, pubKey }: SwapBrcBid): Promise<any>;
    submitSignedBid({ psbtBid, auctionId, bidId }: SignedBid): Promise<any>;
    getFees(): Promise<any>;
    subscribe({ webhookUrl, rbf, }: {
        webhookUrl: String;
        rbf?: Boolean;
    }): Promise<any>;
    importSubscribe({ address, webhookUrl, rbf, }: {
        address: String;
        webhookUrl: String;
        rbf?: Boolean;
    }): Promise<void>;
}
