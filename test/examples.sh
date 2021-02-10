./provendb-oracle install --config=test.yaml --createDemoAccount --dropExisting --oracleConnect=centosdb --provendbPassword=DBEnvy2016 --provendbUser=testprovendb --sysPassword=DBEnvy2016
./provendb-oracle anchor  --tables=PROVENDBDEMO.CONTRACTSTABLE --where "CONTRACTID<3"
./provendb-oracle anchor  --tables=PROVENDBDEMO.CONTRACTSTABLE --where "CONTRACTID<3" --validate=myproof.proof --includeRowIds
./provendb-oracle anchor  --tables=PROVENDBDEMO.CONTRACTSTABLE --where "CONTRACTID<3" --validate=myproof.proof --includeRowIds --includeScn
./provendb-oracle history  --tables=PROVENDBDEMO.CONTRACTSTABLE --where "CONTRACTID=99"
export ROWID=`./provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLE --where "CONTRACTID=99"|tail -1|cut -f2 -d' '`
./provendb-oracle validate --rowId=$ROWID
 export ROWID=`./provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLE --where "CONTRACTID=99"|head -10|tail -1|cut -f2 -d' '`
./provendb-oracle validate --rowId=$ROWID