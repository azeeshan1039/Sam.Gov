"use client";

import { useMemo } from "react";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

const rowData = [
  { id: "SAM-2025-001", title: "IT Infrastructure Support", agency: "GSA", value: "$2.4M", posted: "2025-01-20", due: "2025-02-15" },
  { id: "SAM-2025-002", title: "Cloud Migration Services", agency: "DOD", value: "$5.1M", posted: "2025-01-19", due: "2025-02-20" },
  { id: "SAM-2025-003", title: "Healthcare IT Modernization", agency: "VA", value: "$3.8M", posted: "2025-01-18", due: "2025-02-18" },
  { id: "SAM-2025-004", title: "Cybersecurity Assessment", agency: "DHS", value: "$1.2M", posted: "2025-01-17", due: "2025-02-10" },
  { id: "SAM-2025-005", title: "Data Analytics Platform", agency: "DOJ", value: "$4.5M", posted: "2025-01-16", due: "2025-02-25" },
  { id: "SAM-2025-006", title: "Satellite Ground Systems", agency: "NASA", value: "$8.2M", posted: "2025-01-15", due: "2025-03-01" },
];

const columnDefs: ColDef[] = [
  { field: "id", headerName: "Solicitation ID", flex: 1, minWidth: 140 },
  { field: "title", headerName: "Title", flex: 2, minWidth: 200 },
  { field: "agency", headerName: "Agency", width: 100 },
  { field: "value", headerName: "Est. Value", width: 110 },
  { field: "posted", headerName: "Posted", width: 110 },
  { field: "due", headerName: "Due Date", width: 110 },
];

export default function DashboardTable() {
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
    }),
    []
  );

  return (
    <div className="ag-theme-alpine h-[320px] w-full">
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout="normal"
        suppressCellFocus
        rowHeight={40}
        headerHeight={44}
      />
    </div>
  );
}
