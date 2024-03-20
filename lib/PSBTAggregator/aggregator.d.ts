import { MarketplaceOffer } from '../shared/interface';
export declare class Aggregator {
    apiClient: any;
    offers: any;
    constructor();
    /**
     * Fetches offers from all APIs and aggregates them.
     */
    fetchAndAggregateOffers(ticker: any, limitOrderAmount: any, marketPrice: any): Promise<{
        status: string;
        bestPrice?: undefined;
        closestMatch?: undefined;
    } | {
        bestPrice: {
            averagePrice: number;
            totalPrice: any;
            offers: any;
        };
        closestMatch: {
            averagePrice: number;
            totalPrice: any;
            offers: any;
        };
        status?: undefined;
    }>;
    /**
     * Fetches offers from all external marketplaces.
     */
    _fetchAllOffers(ticker: string): Promise<MarketplaceOffer[]>;
    findAllCombinationsInRange(offers: any, minAmountLimit: any, maxAmountLimit: any): any[];
    scaleOffers(offers: any, scaleFactor: any): any;
    findBestAndClosestMatches(offers: any, targetAmount: any, marketPrice: any): Promise<{
        status: string;
        bestPrice?: undefined;
        closestMatch?: undefined;
    } | {
        bestPrice: {
            averagePrice: number;
            totalPrice: any;
            offers: any;
        };
        closestMatch: {
            averagePrice: number;
            totalPrice: any;
            offers: any;
        };
        status?: undefined;
    }>;
    sumAmounts(indices: any, offers: any): any;
    sumTotalPrice(indices: any, offers: any): any;
}
