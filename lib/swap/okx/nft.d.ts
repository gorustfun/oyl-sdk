import { GenOkxBrcAndCollectibleUnsignedPsbt, PaymentUtxoOptions } from "../types";
export declare function genBrcAndOrdinalUnsignedPsbt({ address, utxos, network, pubKey, orderPrice, sellerPsbt, feeRate, receiveAddress, nOffers }: GenOkxBrcAndCollectibleUnsignedPsbt): string;
export declare function mergeSignedPsbt(signedBuyerPsbt: string, sellerPsbt: string[]): string;
export declare function buildDummyAndPaymentUtxos({ utxos, feeRate, orderPrice, address, receiveAddress, sellerPsbt, nOffers }: PaymentUtxoOptions): {
    dummyUtxos: any[];
    paymentUtxos: any[];
};
