-- This script generates the TypeScript properties for an interface for the Table specified.
SET @tableName = 'TestTable';
SET @tableSchema = 'chinook';

select concat(column_name, ': ', dest, ';') as code 
from  information_schema.columns c
join(
select 'char' as orign ,'string' as dest union all
select 'varchar' ,'string' union all
select 'longtext' ,'string' union all
select 'datetime' ,'Date' union all
select 'text' ,'string' union all
select 'bit' ,'number' union all
select 'bigint' ,'number' union all
select 'int' ,'number' union all
select 'double' ,'number' union all
select 'decimal' ,'number' union all
select 'date' ,'Date' union all
select 'tinyint' ,'boolean'
) tps on c.data_type like tps.orign
where table_schema=@tableSchema and table_name=@tableName 
order by c.ordinal_position