"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const bitcoin = tslib_1.__importStar(require("bitcoinjs-lib"));
const signer_1 = require("./signer");
const bip322_js_1 = require("bip322-js");
const utils_1 = require("../shared/utils");
const bip371_1 = require("bitcoinjs-lib/src/psbt/bip371");
describe('Signer', () => {
    const network = bitcoin.networks.bitcoin;
    const keys = {
        segwitPrivateKey: '4604b4b710fe91f584fff084e1a9159fe4f8408fff380596a604948474ce4fa3',
        taprootPrivateKey: '41f41d69260df4cf277826a9b65a3717e4eeddbeedf637f212ca096576479361',
        legacyPrivateKey: 'e284129cc0922579a535bbf4d1a3b25773090d28c909bc0fed73b5e0222cc372',
        nestedSegwitPrivateKey: '508c73a06f6b6c817238ba61be232f5080ea4616c54f94771156934666d38ee3',
    };
    const message = 'Hello World';
    test('should initialize the Signer class with segwit, taproot, legacy, and nested segwit keys', () => {
        const signer = new signer_1.Signer(network, keys);
        expect(signer.network).toEqual(network);
        expect(signer.segwitKeyPair.publicKey.toString('hex')).toBe(utils_1.ECPair.fromPrivateKey(Buffer.from(keys.segwitPrivateKey, 'hex')).publicKey.toString('hex'));
        expect(signer.taprootKeyPair.publicKey.toString('hex')).toBe(utils_1.ECPair.fromPrivateKey(Buffer.from(keys.taprootPrivateKey, 'hex')).publicKey.toString('hex'));
        expect(signer.legacyKeyPair.publicKey.toString('hex')).toBe(utils_1.ECPair.fromPrivateKey(Buffer.from(keys.legacyPrivateKey, 'hex')).publicKey.toString('hex'));
        expect(signer.nestedSegwitKeyPair.publicKey.toString('hex')).toBe(utils_1.ECPair.fromPrivateKey(Buffer.from(keys.nestedSegwitPrivateKey, 'hex')).publicKey.toString('hex'));
    });
    test('Produce correct message hash', () => {
        const helloWorldHash = bip322_js_1.BIP322.hashMessage('Hello World');
        const emptyStringHash = bip322_js_1.BIP322.hashMessage('');
        expect(Buffer.from(emptyStringHash).toString('hex').toLowerCase()).toEqual('c90c269c4f8fcbe6880f72a721ddfbf1914268a794cbb21cfafee13770ae19f1');
        expect(Buffer.from(helloWorldHash).toString('hex').toLowerCase()).toEqual('f0eb03b1a75ac6d9847f55c624a99169b5dccba2a31f5b23bea77ba270de0a7a');
    });
    test('BIP322 Signer signs correctly', async () => {
        const privateKey = 'KwTbAxmBXjoZM3bzbXixEr9nxLhyYSM4vp2swet58i19bw9sqk5z';
        const privateKeyTestnet = 'cMpadsm2xoVpWV5FywY5cAeraa1PCtSkzrBM45Ladpf9rgDu6cMz';
        const address = '3HSVzEhCFuH9Z3wvoWTexy7BMVVp3PjS6f';
        const addressTestnet = '2N8zi3ydDsMnVkqaUUe5Xav6SZqhyqEduap';
        const addressRegtest = '2N8zi3ydDsMnVkqaUUe5Xav6SZqhyqEduap';
        const message = 'Hello World';
        const expectedSignature = 'AkgwRQIhAMd2wZSY3x0V9Kr/NClochoTXcgDaGl3OObOR17yx3QQAiBVWxqNSS+CKen7bmJTG6YfJjsggQ4Fa2RHKgBKrdQQ+gEhAxa5UDdQCHSQHfKQv14ybcYm1C9y6b12xAuukWzSnS+w';
        const signature = bip322_js_1.Signer.sign(privateKey, address, message);
        const signatureTestnet = bip322_js_1.Signer.sign(privateKey, addressTestnet, message);
        const signatureRegtest = bip322_js_1.Signer.sign(privateKey, addressRegtest, message);
        // Sign with testnet key
        const signatureTestnetKey = bip322_js_1.Signer.sign(privateKeyTestnet, address, message);
        const signatureTestnetTestnetKey = bip322_js_1.Signer.sign(privateKeyTestnet, addressTestnet, message);
        const signatureRegtestTestnetKey = bip322_js_1.Signer.sign(privateKeyTestnet, addressRegtest, message);
        expect(signature).toEqual(expectedSignature);
        expect(signatureTestnet).toEqual(expectedSignature);
        expect(signatureRegtest).toEqual(expectedSignature);
        expect(signatureTestnetKey).toEqual(expectedSignature);
        expect(signatureTestnetTestnetKey).toEqual(expectedSignature);
        expect(signatureRegtestTestnetKey).toEqual(expectedSignature);
    });
    test('Should sign a message with nested segwit keypair', async () => {
        const signtaure = 'AkgwRQIhAIeILWhMNozkb7d3AyiVoT0vBw2mwY1q96FybOfj/bksAiA4ai7LzotKFfmZ6D54Xc8ASeNhUuwqDA6to0x+GA+aLQEhA5s7aUuPxbXgf7Bpx4PKx1T104w+CL7Rlg4x/bHdo1wk';
        let signer = new signer_1.Signer(network, keys);
        const address = bitcoin.payments.p2sh({
            redeem: bitcoin.payments.p2wpkh({
                pubkey: signer.nestedSegwitKeyPair.publicKey,
                network: network,
            }),
        }).address;
        const signedMessage = await signer.signMessage({
            message,
            address,
            keypair: signer.nestedSegwitKeyPair,
            protocol: 'bip322',
        });
        const verifySignature = bip322_js_1.Verifier.verifySignature(address, message, signedMessage);
        expect(signedMessage).toEqual(signtaure);
        expect(verifySignature).toBe(true);
    });
    test('Should sign a message with taproot keypair', async () => {
        const signtaure = 'AUGENGp6oQaTLd9wQt6gOS9lbv03VYMj+T8Hbl7Q5BVqyOl0vn4f8hj8W8e3t8XxqCN32X5sCKmjegMx0hL3Q6EQAQ==';
        let signer = new signer_1.Signer(network, keys);
        const address = bitcoin.payments.p2tr({
            internalPubkey: (0, bip371_1.toXOnly)(signer.taprootKeyPair.publicKey),
            network,
        }).address;
        const signedMessage = await signer.signMessage({
            message,
            address,
            keypair: signer.taprootKeyPair,
            protocol: 'bip322',
        });
        const verifySignature = bip322_js_1.Verifier.verifySignature(address, message, signedMessage);
        expect(signedMessage).toEqual(signtaure);
        expect(verifySignature).toBe(true);
    });
    test('Should sign a message with native segwit keypair', async () => {
        const signtaure = 'AkcwRAIgKjQeMT+Jb9zi6sHHxFb/RiwaLezvFRgB+AlEKcGMqCUCIEvNgnZFCrTJqvnQrw6VjTQ4V9k7PbK8uM44CHv6voffASEDMNVP0N1CCm5fjTYk9fNILK41D3nV8HU79b7vnC2Rrzw=';
        let signer = new signer_1.Signer(network, keys);
        const address = bitcoin.payments.p2wpkh({
            pubkey: signer.segwitKeyPair.publicKey,
            network,
        }).address;
        const signedMessage = await signer.signMessage({
            message,
            address,
            keypair: signer.segwitKeyPair,
            protocol: 'bip322',
        });
        const verifySignature = bip322_js_1.Verifier.verifySignature(address, message, signedMessage);
        expect(signedMessage).toEqual(signtaure);
        expect(verifySignature).toBe(true);
    });
    test('Should sign a message with legacy keypair', async () => {
        const signtaure = 'Hymg5niRV2DQcJWcJllx1mIvPR+vDqekeUhr2/NelgBdfFfIpU5xSM5FsCSqikZmIC7AG03hACFkxKuPp8TfCTI=';
        let signer = new signer_1.Signer(network, keys);
        const address = bitcoin.payments.p2pkh({
            pubkey: signer.legacyKeyPair.publicKey,
            network: network,
        }).address;
        const signedMessage = await signer.signMessage({
            message,
            address,
            keypair: signer.legacyKeyPair,
            protocol: 'bip322',
        });
        const verifySignature = bip322_js_1.Verifier.verifySignature(address, message, signedMessage);
        expect(signedMessage).toEqual(signtaure);
        expect(verifySignature).toBe(true);
    });
    test('Should sign a message with ecdsa keypair', async () => {
        const signtaure = 'QzeHWtTiap2cW8+7iS/0mhzDf1PUVbTmKCx0FRb8x4EDMiHLOdoUKVn3L4+S921lpaCwPXsKvF95TCealGwuhg==';
        let signer = new signer_1.Signer(network, keys);
        const signedMessage = await signer.signMessage({
            message,
            keypair: signer.segwitKeyPair,
            protocol: 'ecdsa',
        });
        const encoder = new TextEncoder();
        const data = encoder.encode(message);
        const hashedBufferArray = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashedBufferArray));
        const hashedMessage = btoa(String.fromCharCode.apply(null, hashArray));
        const verifySignature = signer.segwitKeyPair.verify(Buffer.from(hashedMessage, 'base64'), Buffer.from(signedMessage, 'base64'));
        expect(signedMessage).toEqual(signtaure);
        expect(verifySignature).toBe(true);
    });
    test('should throw an error if keypair is not passed when signing a message', async () => {
        keys.nestedSegwitPrivateKey = undefined;
        let signer = new signer_1.Signer(network, keys);
        const address = bitcoin.payments.p2sh({
            redeem: bitcoin.payments.p2wpkh({
                pubkey: signer.segwitKeyPair.publicKey,
                network: network,
            }),
            network: network,
        }).address;
        await expect(signer.signMessage({
            message,
            address,
            keypair: signer.nestedSegwitKeyPair,
            protocol: 'bip322',
        })).rejects.toThrow('Keypair required to sign');
    });
});
//# sourceMappingURL=signer.test.js.map