/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */

const {
    provendbOracle
} = require('./testCommon');

describe('provendb-oracle Anchor tests', () => {
    beforeAll(() => {});

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => {});

    test('Test help', async () => {
        const output = await provendbOracle('anchor --help');
        expect(output).toEqual(expect.stringMatching('Anchor one or more tables to the blockchain'));
    });
    test('anchor table SCN', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle('anchor --config=testConfig.yaml  --tables=PROVENDBTESTDEMO.CONTRACTSTABLE --validate=testProof.proof --where="CONTRACTID>0"');

        expect(output).toEqual(expect.stringMatching('Anchoring proof: CONFIRMED'));
        expect(output).toEqual(expect.stringMatching('Proof written to testProof.proof'));
        expect(output).toEqual(expect.stringMatching('INFO  100 keys'));
    });

    test('anchor table FBDA', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle('anchor --config=testConfig.yaml --includeRowIds --includeScn --tables=PROVENDBTESTDEMO.CONTRACTSTABLEFBDA --validate=testProof.proof --where="CONTRACTID>0"');

        expect(output).toEqual(expect.stringMatching('Anchoring proof: CONFIRMED'));
        expect(output).toEqual(expect.stringMatching('Proof written to testProof.proof'));
        expect(output).toEqual(expect.stringMatching('INFO  100 keys'));
    });

    test('anchor table FBDA noSCN', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle('anchor --config=testConfig.yaml   --tables=PROVENDBTESTDEMO.CONTRACTSTABLEFBDA --validate=testProof.proof --where="CONTRACTID>0"');

        expect(output).toEqual(expect.stringMatching('Anchoring proof: CONFIRMED'));
        expect(output).toEqual(expect.stringMatching('Proof written to testProof.proof'));
        expect(output).toEqual(expect.stringMatching('INFO  100 keys'));
    });

});

 
