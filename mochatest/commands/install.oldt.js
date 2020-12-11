const {
    expect,
    test
} = require('@oclif/test')

describe('install', () => {
    const user = 'provendbtest' + Math.round(Math.random() * 10000);
    test
        .stdout()
        .command(['install'])
        .it('test install', ctx => {
            expect(ctx.stdout).to.contain('ERROR');
            expect(ctx.stdout).to.contain('See more help');
        });
    test
        .stdout()
        .command(['install', '--help']).exit(0)
        .it('test install help', ctx => {
            expect(ctx.stdout).to.contain('--dropExisting');
        });

    test
        .stdout()
        .command(['install', '--config']).exit(0)
        .it('test true install', ctx => {
          expect(ctx.stdout).to.contain('--dropExisting');
        });
});