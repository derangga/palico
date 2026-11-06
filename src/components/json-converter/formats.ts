import type { Delimiter, Format } from "#/lib/json-converter/types.ts";
import { m } from "#/paraglide/messages.js";

// Format names are the same in every language, so they are not messages.
export const FORMAT_NAME: Record<Format, string> = {
	json: "JSON",
	yaml: "YAML",
	csv: "CSV",
};

export const FILE_EXTENSION: Record<Format, string> = {
	json: "json",
	yaml: "yaml",
	csv: "csv",
};

export const MIME_TYPE: Record<Format, string> = {
	json: "application/json",
	yaml: "application/yaml",
	csv: "text/csv",
};

/** What a format becomes until the person picks a target: JSON to YAML, and the others to JSON. */
export const defaultTarget = (source: Format): Format =>
	source === "json" ? "yaml" : "json";

// A function: the delimiter names depend on the active language.
export const delimiterName = (delimiter: Delimiter): string => {
	switch (delimiter) {
		case ",":
			return m.jc_delimiter_comma();
		case ";":
			return m.jc_delimiter_semicolon();
		case "\t":
			return m.jc_delimiter_tab();
	}
};

export const EXAMPLE = `[
  {
    "id": 1,
    "name": "Mika Tanaka",
    "email": "mika@example.com",
    "roles": ["admin", "editor"],
    "active": true
  },
  {
    "id": 2,
    "name": "Sari Wijaya",
    "email": "sari@example.com",
    "roles": ["viewer"],
    "active": false
  },
  {
    "id": 3,
    "name": "Jo Okafor",
    "email": "jo@example.com",
    "roles": [],
    "active": true
  }
]
`;
