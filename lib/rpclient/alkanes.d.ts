interface Rune {
    rune: {
        id: {
            block: string;
            tx: string;
        };
        name: string;
        spacedName: string;
        divisibility: number;
        spacers: number;
        symbol: string;
    };
    balance: string;
}
interface Outpoint {
    runes: Rune[];
    outpoint: {
        txid: string;
        vout: number;
    };
    output: {
        value: string;
        script: string;
    };
    txindex: number;
    height: 2;
}
interface AlkanesResponse {
    outpoints: Outpoint[];
    balanceSheet: [];
}
interface AlkaneSimulateRequest {
    alkanes: any[];
    transaction: string;
    block: string;
    height: string;
    txindex: number;
    target: {
        block: string;
        tx: string;
    };
    inputs: string[];
    pointer: number;
    refundPointer: number;
    vout: number;
}
export declare class AlkanesRpc {
    alkanesUrl: string;
    constructor(url: string);
    _call(method: any, params?: any[]): Promise<any>;
    getAlkanesByHeight({ blockHeight, protocolTag, }: {
        blockHeight: number;
        protocolTag: string;
    }): Promise<AlkanesResponse>;
    getAlkanesByAddress({ address, protocolTag, }: {
        address: string;
        protocolTag?: string;
    }): Promise<AlkanesResponse>;
    trace(request: {
        vout: number;
        txid: string;
    }): Promise<any>;
    simulate(request: AlkaneSimulateRequest): Promise<any>;
    getAlkanesByOutpoint({ txid, vout, protocolTag, }: {
        txid: string;
        vout: number;
        protocolTag?: string;
    }): Promise<any>;
    parseSimulateReturn(v: any): Promise<{
        string: string;
        bytes: string;
        le: string;
        be: string;
    }>;
}
export {};
