import { type Extension } from "@codemirror/state";

import { tableField } from "../table/tableField";
import { type CellEditingSurface } from "./cellEditingSurface";
import { tableV2Sync } from "./tableV2Sync";

/** The V2 table extension: widget field + surface synchronisation. */
export function tableV2(surface: CellEditingSurface): Extension {
  return [tableField, tableV2Sync(surface)];
}
