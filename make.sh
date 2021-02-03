rm dist/provendb-oracle-linux.zip 
cp node_modules/oracledb/build/Release/oracledb-5.1.0-linux-x64.node dist
pkg   -t node12-linux -o dist/provendb-oracle-linux . 
cd dist
mv provendb-oracle-linux provendb-oracle
chmod 755 provendb-oracle
zip provendb-oracle-linux.zip provendb-oracle oracledb-5.1.0-linux-x64.node

cd ..
rm dist/provendb-oracle-darwin.zip 
cp node_modules/oracledb/build/Release/oracledb-5.1.0-darwin-x64.node  dist
pkg  -t node12-darwin -o dist/provendb-oracle-darwin . 
cd dist
mv provendb-oracle-darwin provendb-oracle
chmod 755 provendb-oracle
zip provendb-oracle-mac.zip provendb-oracle oracledb-5.1.0-darwin-x64.node

rm provendb-oracle