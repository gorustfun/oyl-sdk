/// <reference types="node" />
/// <reference types="node" />
import { Account, Signer, Provider } from '..';
import * as bitcoin from 'bitcoinjs-lib';
import { AlkanesPayload, GatheredUtxos } from '../shared/interface';
export declare const contractDeployment: ({ payload, gatheredUtxos, account, reserveNumber, provider, feeRate, signer, }: {
    payload: AlkanesPayload;
    gatheredUtxos: GatheredUtxos;
    account: Account;
    reserveNumber: string;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    commitTx: string;
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const actualDeployCommitFee: ({ payload, tweakedTaprootKeyPair, gatheredUtxos, account, provider, feeRate, signer, }: {
    payload: AlkanesPayload;
    tweakedTaprootKeyPair: bitcoin.Signer;
    gatheredUtxos: GatheredUtxos;
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    fee: number;
}>;
export declare const actualDeployRevealFee: ({ createReserveNumber, tweakedTaprootKeyPair, commitTxId, receiverAddress, script, provider, feeRate, }: {
    createReserveNumber: string;
    tweakedTaprootKeyPair: bitcoin.Signer;
    commitTxId: string;
    receiverAddress: string;
    script: Buffer;
    provider: Provider;
    signer: Signer;
    feeRate?: number;
}) => Promise<{
    fee: number;
}>;
export declare const deployReveal: ({ createReserveNumber, commitTxId, script, account, provider, feeRate, signer, }: {
    createReserveNumber: string;
    commitTxId: string;
    script: string;
    account: Account;
    provider: Provider;
    feeRate?: number;
    signer: Signer;
}) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
