CREATE OR REPLACE FUNCTION f_anchorRequest(tableName varchar2(120),columnList varchar2(1000),whereclause varchar2(1000))
                        RETURN provendbRequests.id%TYPE IS 
                        l_id provendbRequests.id%TYPE;
                        l_json varchar2(4000);
                    BEGIN
                        l_json:='{"table":"'||tableName||'"' ;
                        if columnList is not null then 
                            l_json:=l_json||'"columns":'||columnList||'"';
                        end if;
                        if whereclause is not null then 
                            l_json:=l_json||'"where":'||whereclause||'"';
                        end if;
                        l_json:=l_json||'}';
                        INSERT INTO provendbRequests(requestJSON) 
                            VALUES(l_json)
                            returning id INTO l_id;
                        COMMIT;
                        RETURN(l_id);
                    END;