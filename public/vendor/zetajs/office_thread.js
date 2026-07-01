/* Office thread for Palico's Office → PDF tool.
 *
 * Runs INSIDE LibreOffice's Emscripten pthread worker (loaded via
 * ZetaHelperMain -> import(threadJs)). It drives the UNO API to load a document
 * from the in-memory Emscripten FS and store it back out as PDF.
 *
 * Adapted from the upstream zetajs `convertpdf` example. Differences:
 *  - imports ZetaHelperThread from the sibling vendored file (./zetaHelper.js)
 *  - reports failures back to the main thread as a typed {cmd:'error'} message
 *    instead of only console.log, so the app can surface a real error.
 *
 * JS mode: module
 */
import { ZetaHelperThread } from "./zetaHelper.js";

const zHT = new ZetaHelperThread();
const zetajs = zHT.zetajs;
const css = zHT.css;

let xModel;

function main() {
	const beanHidden = new css.beans.PropertyValue({
		Name: "Hidden",
		Value: true,
	});
	const beanOverwrite = new css.beans.PropertyValue({
		Name: "Overwrite",
		Value: true,
	});
	const beanPdfExport = new css.beans.PropertyValue({
		Name: "FilterName",
		Value: "writer_pdf_Export",
	});

	zHT.thrPort.onmessage = (e) => {
		switch (e.data.cmd) {
			case "convert": {
				const { id, name, from, to } = e.data;
				try {
					// Close any previous document before loading the next one.
					if (
						xModel !== undefined &&
						xModel.queryInterface(
							zetajs.type.interface(css.util.XCloseable),
						)
					) {
						xModel.close(false);
						xModel = undefined;
					}
					xModel = zHT.desktop.loadComponentFromURL(
						`file://${from}`,
						"_blank",
						0,
						[beanHidden],
					);
					xModel.storeToURL(`file://${to}`, [beanOverwrite, beanPdfExport]);
					zetajs.mainPort.postMessage({ cmd: "converted", id, name, from, to });
				} catch (err) {
					let message;
					try {
						const exc = zetajs.catchUnoException(err);
						message = exc.Message || String(zetajs.getAnyType(exc));
					} catch {
						message = err instanceof Error ? err.message : String(err);
					}
					zetajs.mainPort.postMessage({ cmd: "error", id, name, message });
				}
				break;
			}
			default:
				throw Error(`Unknown message command: ${e.data.cmd}`);
		}
	};

	// Signal readiness to the main thread.
	zHT.thrPort.postMessage({ cmd: "start" });
}

main();
