import { SandshrewBitcoinClient } from '../rpclient/sandshrew';
import { EsploraRpc } from '../rpclient/esplora';
import { OrdRpc } from '../rpclient/ord';
import { Opi } from '../rpclient/opi';
import { OylApiClient } from '../apiclient';
import * as bitcoin from 'bitcoinjs-lib';
import { AlkanesRpc } from '../rpclient/alkanes';
export type ProviderConstructorArgs = {
    url: string;
    projectId: string;
    network: bitcoin.networks.Network;
    networkType: 'signet' | 'mainnet' | 'testnet' | 'regtest';
    version?: string;
    apiUrl?: string;
    opiUrl?: string;
};
export declare const defaultNetworkOptions: (networkType: string) => {
    baseUrl: string;
    version: string;
    projectId: string;
    network: string;
    apiUrl: string;
    opiUrl: string;
};
export declare class Provider {
    sandshrew: SandshrewBitcoinClient;
    esplora: EsploraRpc;
    ord: OrdRpc;
    opi: Opi;
    api: OylApiClient;
    alkanes: AlkanesRpc;
    network: bitcoin.networks.Network;
    networkType: string;
    url: string;
    constructor({ url, projectId, network, networkType, version, apiUrl, opiUrl, }: ProviderConstructorArgs);
    pushPsbt({ psbtHex, psbtBase64, }: {
        psbtHex?: string;
        psbtBase64?: string;
    }): Promise<{
        txId: string;
        rawTx: string;
        size: any;
        weight: any;
        fee: number;
        satsPerVByte: string;
    }>;
}
