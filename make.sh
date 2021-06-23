./node_modules/@oclif/dev-cli/bin/run readme

rm dist/provendb-oracle-linux.tar.gz 
cp node_modules/oracledb/build/Release/oracledb-5.1.0-linux-x64.node dist
pkg  --options max_old_space_size=8192 -t node12-linux -o dist/provendb-oracle-linux . 
cd dist
mv provendb-oracle-linux provendb-oracle
chmod 755 provendb-oracle
tar zcvf provendb-oracle-linux.tar.gz provendb-oracle oracledb-5.1.0-linux-x64.node

cd ..
rm dist/provendb-oracle-darwin.tar.gz 
cp node_modules/oracledb/build/Release/oracledb-5.1.0-darwin-x64.node  dist
pkg  --options max_old_space_size=8192 -t node12-darwin -o dist/provendb-oracle-darwin . 
cd dist
mv provendb-oracle-darwin provendb-oracle
chmod 755 provendb-oracle
tar zcvf provendb-oracle-mac.tar.gz provendb-oracle oracledb-5.1.0-darwin-x64.node

rm provendb-oracle *.node