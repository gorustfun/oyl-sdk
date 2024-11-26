import { MnemonicToAccountOptions } from '..';
import { ProviderConstructorArgs } from '..';
export declare const UTXO_DUST = 546;
export declare const maximumScriptBytes = 520;
export declare const MAXIMUM_FEE = 5000000;
export declare const regtestProviderConstructorArgs: ProviderConstructorArgs;
export declare const regtestOpts: MnemonicToAccountOptions;
export declare const Opts: MnemonicToAccountOptions;
export declare const getBrc20Data: ({ amount, tick, }: {
    amount: number | string;
    tick: string;
}) => {
    mediaContent: string;
    mediaType: string;
};
