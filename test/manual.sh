sqlplus system/myLongPassword23@guy13.local:1526/orclpdb1

provendb-oracle install --config=provendb.yaml --createDemoAccount --dbaPassword=myLongPassword23 --dropExisting --oracleConnect=mubuntu.local:1526/orclpdb1 --provendbPassword=myLongPassword23 --provendbUser=provendbTest --dbaUserName=system

./provendb-oracle install --config=provendb.yaml --createDemoAccount --sysPassword=myLongPassword23 --dropExisting --oracleConnect=guy13.local:1526/orclpdb1 --provendbPassword=myLongPassword23 --provendbUser=provendbTest

./provendb-oracle anchor --config=provendb.yaml --tables=PROVENDBTESTDEMO.CONTRACTSTABLE

./provendb-oracle history --config=provendb.yaml --tables=PROVENDBTESTDEMO.CONTRACTSTABLE

./provendb-oracle validate --proofId=b3da613f5e5b59814b4a472a048335a66b30683608eb67f08afa4a8e6aee3ff4:ap321wRpwwdyIYHt0cqUB

./provendb-oracle validate --rowId=AAASA3AAMAAABoOAAT

notepad provendb.yaml

