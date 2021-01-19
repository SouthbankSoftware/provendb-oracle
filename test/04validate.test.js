/**
 *  Unit Test for provendb-oracle
 * @Author: Guy Harrison
 * */
/* eslint unicorn/filename-case:off */


// match(/^(\S*)(\s*)(\S*)(\s*)([A-Za-z0-9+/]*\.[0-9]*)(.*)/)

const {
    provendbOracle
} = require('./common.test');


describe('provendb-oracle Anchor tests', () => {
    beforeAll(() => {});

    beforeEach(() => {

    });

    afterEach(() => {

    });

    afterAll(() => {});

    test('Test help', async () => {
        const output = await provendbOracle('validate --help');
        expect(output).toEqual(expect.stringMatching('Validate a rowId against the most recent proof'));
    });

    test('Validate a rowid SCN', async () => {
        jest.setTimeout(120000);
        const output = await provendbOracle('history --config=testConfig.yaml --tables=PROVENDBTESTDEMO.CONTRACTSTABLEFBDA');

        expect(output).toEqual(expect.stringMatching('Table:  PROVENDBTESTDEMO.CONTRACTSTABLEFBDA'));
        expect(output).toEqual(expect.stringMatching('Rowid'));
        const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
        let rowidScn;
        for (let ln = 0; ln < lines.length; ln++) {
            const line = lines[ln];
            const lmatch = line.match(/^([A-Za-z0-9+/]*)(\s*)(\S*)(\s*)([A-Za-z0-9+/]*\.[0-9]*)(.*)/);
            if (lmatch) {
                rowidScn = lmatch[5];
                break;
            }
        }
        const vOutput = await provendbOracle(`validate --config=testConfig.yaml --rowid=${rowidScn}`);
        expect(vOutput).toEqual(expect.stringMatching('Rowid validation passed'));
        expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
    });
// x.match(/^([A-Za-z0-9+/]*)(\s*)(\S*)(\s*)([A-Za-z0-9+\./]*)(\s*)(\S*)(\s*)(\S*)$/)

    test('Validate an entire Proof', async () => {
      jest.setTimeout(120000);
      const output = await provendbOracle('history --config=testConfig.yaml --tables=PROVENDBTESTDEMO.CONTRACTSTABLEFBDA');

      expect(output).toEqual(expect.stringMatching('Table:  PROVENDBTESTDEMO.CONTRACTSTABLEFBDA'));
      expect(output).toEqual(expect.stringMatching('Rowid'));
      const lines = output.toString().split(/(?:\r\n|\r|\n)/g);
      let proofId;
      for (let ln = 0; ln < lines.length; ln++) {
          const line = lines[ln];
          const lmatch = line.match(/^([A-Za-z0-9+/]*)(\s*)(\S*)(\s*)([A-Za-z0-9+\./]*)(\s*)(\S*)Z(\s*)(\S*)Z$/);
          if (lmatch) {
            console.log(lmatch);
              proofId = lmatch[3];
              break;
          }
      }
      const vOutput = await provendbOracle(`validate --config=testConfig.yaml --proofId=${proofId}`);
      expect(vOutput).toEqual(expect.stringMatching('All keys validated'));
      expect(vOutput).not.toEqual(expect.stringMatching('ERROR'));
  });
});
