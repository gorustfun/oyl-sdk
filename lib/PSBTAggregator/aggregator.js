"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Aggregator = void 0;
const apiclient_1 = require("../apiclient");
class Aggregator {
    constructor() {
        this.apiClient = new apiclient_1.OylApiClient({ host: 'https://api.oyl.gg', apiKey: "" });
    }
    /**
     * Fetches offers from all APIs and aggregates them.
     */
    fetchAndAggregateOffers(ticker, limitOrderAmount, marketPrice) {
        return __awaiter(this, void 0, void 0, function* () {
            const offers = yield this._fetchAllOffers(ticker);
            console.log({ offers });
            return this.findBestAndClosestMatches(offers, limitOrderAmount, marketPrice);
        });
    }
    /**
     * Fetches offers from all external marketplaces.
     */
    _fetchAllOffers(ticker) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const allOffers = [];
                const okxOffers = yield this.apiClient.getOkxTickerOffers({ ticker });
                for (const offer of okxOffers) {
                    allOffers.push({
                        ticker: offer.ticker,
                        offerId: offer.nftId,
                        amount: offer.amount,
                        address: offer.ownerAddress,
                        marketplace: 'okx',
                        unitPrice: parseFloat(offer.unitPrice.satPrice),
                        totalPrice: parseFloat(offer.totalPrice.satPrice),
                    });
                }
                const unisatOffers = yield this.apiClient.getUnisatTickerOffers({
                    ticker,
                });
                for (const offer of unisatOffers) {
                    allOffers.push({
                        ticker: offer.tick,
                        offerId: offer.auctionId,
                        amount: offer.amount.toString(),
                        address: offer.address,
                        marketplace: 'unisat',
                        unitPrice: offer.unitPrice,
                        totalPrice: offer.price,
                    });
                }
                const omnisatOffers = yield this.apiClient.getOmnisatTickerOffers({
                    ticker,
                });
                for (const offer of omnisatOffers) {
                    allOffers.push({
                        ticker: offer.tick,
                        offerId: offer._id,
                        amount: offer.amount.toString(),
                        address: offer.ownerAddress,
                        marketplace: 'omnisat',
                        unitPrice: offer.amount / offer.price,
                        totalPrice: offer.price,
                    });
                }
                this.offers = allOffers;
                return allOffers;
            }
            catch (error) {
                console.error(error);
                throw Error('An error occured while fetching offers');
            }
        });
    }
    findAllCombinationsInRange(offers, minAmountLimit, maxAmountLimit) {
        const n = offers.length;
        const dp = Array.from({ length: 2 }, () => Array(maxAmountLimit + 1).fill(false));
        const parent = Array.from({ length: n + 1 }, () => Array(maxAmountLimit + 1).fill(-1));
        dp[0][0] = true;
        // Populate DP table and parent for backtracking
        for (let i = 1; i <= n; i++) {
            for (let w = 0; w <= maxAmountLimit; w++) {
                dp[i % 2][w] = dp[(i - 1) % 2][w]; // Default: carry over the previous value
                parent[i][w] = w; // Default: no change in weight
                if (w >= offers[i - 1].scaledAmount && dp[(i - 1) % 2][w - offers[i - 1].scaledAmount]) {
                    dp[i % 2][w] = true;
                    parent[i][w] = w - offers[i - 1].scaledAmount;
                }
            }
        }
        const solutions = [];
        // Function to backtrack and find solution paths
        function backtrack(index, target) {
            let path = [];
            let curr = target;
            for (let i = index; i >= 1 && curr >= 0; --i) {
                if (parent[i][curr] !== curr) { // This offer was used
                    path.push(i - 1); // Adjust for zero-based indexing
                    curr = parent[i][curr];
                }
            }
            if (path.length > 0) {
                const totalAmount = path.reduce((acc, idx) => acc + offers[idx].scaledAmount, 0);
                const totalPrice = path.reduce((acc, idx) => acc + offers[idx].totalPrice, 0);
                solutions.push({ totalAmount, totalPrice, selectedIndices: path.reverse() });
            }
        }
        // Find all valid combinations within the range
        for (let target = minAmountLimit; target <= maxAmountLimit; target++) {
            if (dp[n % 2][target]) {
                backtrack(n, target);
            }
        }
        return solutions;
    }
    scaleOffers(offers, scaleFactor) {
        return offers.map(offer => (Object.assign(Object.assign({}, offer), { scaledAmount: Math.round(offer.amount / scaleFactor) })));
    }
    findBestAndClosestMatches(offers, targetAmount, marketPrice) {
        return __awaiter(this, void 0, void 0, function* () {
            const maxAmount = Math.max(...offers.map(offer => offer.amount));
            const scaleFactor = maxAmount > 4294967295 ? 10000 : 1;
            const scaledTargetAmount = targetAmount / scaleFactor;
            const targetPrice = scaledTargetAmount * marketPrice;
            const maxTargetAmount = scaledTargetAmount + 0;
            const minTargetAmount = scaledTargetAmount - 0;
            const solutions = this.findAllCombinationsInRange(this.scaleOffers(offers, scaleFactor), minTargetAmount, maxTargetAmount);
            if (solutions.length === 0) {
                return { status: "No offers available" }; // No solutions available
            }
            // Find the solution with the best average price
            let bestPriceSolution = solutions[0];
            let bestAveragePrice = bestPriceSolution.minCost / this.sumAmounts(bestPriceSolution.selectedIndices, offers);
            for (const solution of solutions) {
                let averagePrice = solution.minCost / this.sumAmounts(solution.selectedIndices, offers);
                if (averagePrice < bestAveragePrice) {
                    bestAveragePrice = averagePrice;
                    bestPriceSolution = solution;
                }
            }
            // Find the closest match to the target price and amount
            let closestMatchSolution = solutions[0];
            let minDifference = Math.abs(targetPrice - this.sumTotalPrice(closestMatchSolution.selectedIndices, offers));
            for (const solution of solutions) {
                let totalPrice = this.sumTotalPrice(solution.selectedIndices, offers);
                let difference = Math.abs(totalPrice - targetPrice);
                if (difference < minDifference) {
                    minDifference = difference;
                    closestMatchSolution = solution;
                }
            }
            return {
                bestPrice: {
                    averagePrice: bestPriceSolution.minCost / this.sumAmounts(bestPriceSolution.selectedIndices, offers),
                    totalPrice: bestPriceSolution.minCost,
                    offers: bestPriceSolution.selectedIndices.map(index => offers[index])
                },
                closestMatch: {
                    averagePrice: closestMatchSolution.minCost / this.sumAmounts(closestMatchSolution.selectedIndices, offers),
                    totalPrice: closestMatchSolution.minCost,
                    offers: closestMatchSolution.selectedIndices.map(index => offers[index])
                }
            };
        });
    }
    sumAmounts(indices, offers) {
        return indices.reduce((sum, index) => sum + offers[index].amount, 0);
    }
    sumTotalPrice(indices, offers) {
        return indices.reduce((sum, index) => sum + offers[index].totalPrice, 0);
    }
}
exports.Aggregator = Aggregator;
//# sourceMappingURL=aggregator.js.map