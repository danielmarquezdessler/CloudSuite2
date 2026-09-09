import React, { Fragment } from 'react';
import SelectControl from '../components/Shared/SelectControl';

export const Filter = ({ column }: any) => {
  return (
    <Fragment>
      {column.canFilter && (
        <div style={{ marginTop: 5 }}>
          {column.canFilter && column.render('Filter')}
        </div>
      )}
    </Fragment>
  );
};

interface DefaultColumnProps {
  column?: any;
  filterValue?: any;
  setFilter?: any;
  preFilteredRows?: any;
}

export const DefaultColumnFilter = ({
  column: {
    filterValue,
    setFilter,
    preFilteredRows: { length },
  },
}: DefaultColumnProps) => {
  return (
    <input
      value={filterValue || ''}
      onChange={(e: any) => {
        setFilter(e.target.value || undefined);
      }}
      placeholder={`search (${length}) ...`}
    />
  );
};

interface SelectColumnFilterProps {
  column?: any;
  filterValue?: any;
  setFilter?: any;
  preFilteredRows?: any;
  id?: any;
}

export const SelectColumnFilter = ({
  column: { filterValue, setFilter, preFilteredRows, id },
}: SelectColumnFilterProps) => {
  const options = React.useMemo(() => {
    const options: any = new Set();
    preFilteredRows.forEach((row: any) => {
      options.add(row.values[id]);
    });
    return [...options.values()];
  }, [id, preFilteredRows]);

  return <SelectControl id='custom-select' ariaLabel="Filtrar columna" label={filterValue || 'All'} options={[{ value:'', label:'All' }, ...options.map((option: any) => ({ value:String(option), label:String(option) }))]} value={filterValue || ''} onChange={(value) => setFilter(value || undefined)} />;
};
