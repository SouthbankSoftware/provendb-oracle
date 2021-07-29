DROP TABLE provendbrequests;
DROP SEQUENCE provendbSequence; 

CREATE SEQUENCE provendbSequence;

CREATE TABLE provendbRequests (
	id NUMBER   DEFAULT provendbSequence.nextval,
	requestType VARCHAR2(12) DEFAULT('ANCHOR'),
	requestJSON VARCHAR2(4000) ,
	status VARCHAR2(12) DEFAULT('NEW'),
	statusDate DATE DEFAULT(SYSDATE),
	messages VARCHAR(4000),
	CONSTRAINT "requestIsJSON" CHECK (requestJSON IS JSON),
    CONSTRAINT provendbRequests_pk PRIMARY KEY (id));
   
CREATE OR REPLACE FUNCTION anchorRequest(l_requestJSON provendbRequests.requestJSON%type)
    RETURN provendbRequests.id%TYPE IS 
	l_id provendbRequests.id%TYPE;
BEGIN
	INSERT INTO provendbRequests(requestJSON) 
	VALUES(l_requestJSON)
	returning id INTO l_id;
	RETURN(l_id);
END;
/

CREATE INDEX provendbRequests_i1 ON provendbRequests(status,statusDate);

var id number;

BEGIN	
	:id:=anchorRequest('{
    "tableName": "PROVENDBDEMO.CONTRACTSTABLE",
    "whereClause": "CONTRACTID <= 10 ",
    "columnList ": " CONTRACTID, CONTRACTDATA "}');
END;
/
print :id;
