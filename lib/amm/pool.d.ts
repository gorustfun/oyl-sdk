import { Account, Provider, Signer } from '..';
import { AlkaneId, Utxo } from 'shared/interface';
export type AddLiquiditySimulationResult = {
    lpTokens: bigint;
    lpTokenId: {
        block: bigint;
        tx: bigint;
    };
};
export type RemoveLiquiditySimulationResult = {
    token0Amount: bigint;
    token1Amount: bigint;
};
export type SwapSimulationResult = {
    amountOut: bigint;
};
export declare enum PoolOpcodes {
    INIT_POOL = 0,
    ADD_LIQUIDITY = 1,
    REMOVE_LIQUIDITY = 2,
    SWAP = 3,
    SIMULATE_SWAP = 4
}
export declare class AlkanesAMMPoolDecoder {
    decodeSwap(data: string): SwapSimulationResult | undefined;
    static decodeSimulation(result: any, opcode: number): any;
}
export declare const mint: (calldata: bigint[], token0: AlkaneId, token0Amount: bigint, token1: AlkaneId, token1Amount: bigint, gatheredUtxos: {
    utxos: Utxo[];
    totalAmount: number;
}, feeRate: number, account: Account, signer: Signer, provider: Provider) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const burn: (calldata: bigint[], token: AlkaneId, tokenAmount: bigint, gatheredUtxos: {
    utxos: Utxo[];
    totalAmount: number;
}, feeRate: number, account: Account, signer: Signer, provider: Provider) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const swap: (calldata: bigint[], token: AlkaneId, tokenAmount: bigint, gatheredUtxos: {
    utxos: Utxo[];
    totalAmount: number;
}, feeRate: number, account: Account, signer: Signer, provider: Provider) => Promise<{
    txId: string;
    rawTx: string;
    size: any;
    weight: any;
    fee: number;
    satsPerVByte: string;
}>;
export declare const getPoolId: () => Promise<void>;
