provendb-oracle install --config=provendb.yaml --createDemoAccount --sysPassword=myLongPassword23 \
     --dropExisting --oracleConnect=local  --provendbPassword=myLongPassword23 --provendbUser=provendb

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLE 

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLE --columns="CONTRACTDATA,metadata"


provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLE --columns="CONTRACTDATA,metadata" --keyColumn="CONTRACTID"

provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLE --where=CONTRACTID=1

provendb-oracle validate --rowId=AAASHaAAMAAAAlbAAA

unzip AAASHaAAMAAAAlbAAA.provendb

jq <AAASHaAAMAAAAlbAAA.json

provendb-oracle validate --rowId=AAASHaAAMAAAAlbAAA --generateCertificate

open -a Preview AAASHaAAMAAAAlbAAA.pdf

sql provendbdemo/myLongPassword23@local

update contractstable set mytimestamp=sysdate-365 where contractid=1;

provendb-oracle validate --rowId=AAASHaAAMAAAAlbAAA

provendb-oracle monitor --help

provendb-oracle monitor -m 500 --tables=PROVENDBDEMO.CONTRACTSTABLE


insert into contractstable (contractid,metadata,contractdata,mytimestamp) select max(contractid+1),max(metadata),max(contractData),sysdate from contractstable;
insert into contractstable (contractid,metadata,contractdata,mytimestamp) select max(contractid+1),max(metadata),max(contractData),sysdate from contractstable;
commit;

provendb-oracle anchor --tables=PROVENDBDEMO.CONTRACTSTABLEFBDA --includeScn

update contractstablefbda set mytimestamp=sysdate-365 where contractid=1;
commit;

provendb-oracle history --tables=PROVENDBDEMO.CONTRACTSTABLEFBDA --where=CONTRACTID=1


var request_id number
        DECLARE
            v_Return NUMBER;
        BEGIN
            :request_id:= F_ANCHORREQUEST(
            TABLENAME => 'PROVENDBDEMO.CONTRACTSTABLE',
            WHERECLAUSE => 'CONTRACTID<10',
            COLUMNLIST => 'CONTRACTDATA',
            KEYCOLUMN => 'CONTRACTID' );
     
        END;
/
print request_id;

