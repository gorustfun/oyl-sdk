import { MarketplaceOffer, MarketplaceBatchOffer } from './types';
import { FormattedUtxo } from '../shared/interface';
export declare function getUnisatOrdinalsOfferFees(offer: MarketplaceOffer | MarketplaceBatchOffer, paymentAddress: string, receiveAddress: string, paymentUtxos: FormattedUtxo[], feeRate: number): {
    estimatedSelectedUtxos: FormattedUtxo[];
    totalCost: number;
};
