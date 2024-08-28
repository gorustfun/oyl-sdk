import { Provider } from '../provider';
import { Account, SpendStrategy } from '../account';
export interface EsploraUtxo {
    txid: string;
    vout: number;
    status: {
        confirmed: boolean;
        block_height: number;
        block_hash: string;
        block_time: number;
    };
    value: number;
}
export interface FormattedUtxo {
    txId: string;
    outputIndex: number;
    satoshis: number;
    scriptPk: string;
    address: string;
    inscriptions: any[];
    confirmations: number;
}
export declare const availableBalance: ({ account, provider, }: {
    account: Account;
    provider: Provider;
}) => Promise<{
    balance: number;
}>;
export declare const addressSpendableUtxos: ({ address, provider, spendAmount, spendStrategy, }: {
    address: string;
    provider: Provider;
    spendAmount?: number;
    spendStrategy?: SpendStrategy;
}) => Promise<{
    totalAmount: number;
    utxos: FormattedUtxo[];
}>;
export declare const accountSpendableUtxos: ({ account, provider, spendAmount, }: {
    account: Account;
    provider: Provider;
    spendAmount?: number;
}) => Promise<{
    totalAmount: number;
    utxos: FormattedUtxo[];
}>;
export declare const accountBalance: ({ account, provider, }: {
    account: Account;
    provider: Provider;
}) => Promise<{
    balance: number;
    pendingBalance: number;
}>;
export declare const addressUtxos: ({ address, provider, spendStrategy, }: {
    address: string;
    provider: Provider;
    spendStrategy?: SpendStrategy;
}) => Promise<{
    spendableTotalBalance: number;
    spendableUtxos: FormattedUtxo[];
    runeUtxos: FormattedUtxo[];
    ordUtxos: FormattedUtxo[];
    pendingUtxos: FormattedUtxo[];
    pendingTotalBalance: number;
    totalBalance: number;
}>;
export declare const accountUtxos: ({ account, provider, }: {
    account: Account;
    provider: Provider;
}) => Promise<{
    accountTotalBalance: number;
    accountSpendableTotalBalance: number;
    accountPendingTotalBalance: number;
    accounts: any[];
}>;
