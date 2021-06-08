provendb-oracle install --config=provendb.yaml --createDemoAccount --sysPassword=myLongPassword23 \
     --dropExisting --oracleConnect=local  --provendbPassword=myLongPassword23

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLE 

provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLE --where=CONTRACTID=1

provendb-oracle validate --rowId=AAAR7iAAMAAAAldAAA

unzip unzip AAAR7iAAMAAAAldAAA.provendb

jq <AAAR7iAAMAAAAldAAA.json

sql provendbdemo/myLongPassword23@local

update contractstable set mytimestamp=sysdate-365 where contractid=1;

provendb-oracle validate --rowId=AAAR7iAAMAAAAldAAA

provendb-oracle monitor --help

provendb-oracle monitor -m 500 --tables=PROVENDBDEMO.CONTRACTSTABLE


insert into contractstable (contractid,metadata,contractdata,mytimestamp) select max(contractid+1),max(metadata),max(contractData),sysdate from contractstable;
insert into contractstable (contractid,metadata,contractdata,mytimestamp) select max(contractid+1),max(metadata),max(contractData),sysdate from contractstable;
commit;

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLEFBDA --includeScn

update contractstablefbda set mytimestamp=sysdate-365 where contractid=1;
commit;

provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLEFBDA --where=CONTRACTID=1

