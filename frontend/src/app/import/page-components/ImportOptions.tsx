import './ImportOptions.css';

import CodeMirrorEditor from "@/app/components/CodeMirrorEditor";
import {
    IMPORT_STATUS,
} from "@/app/constants";

interface ImportOptionsProps {
    keyPrefix: string;
    setKeyPrefix: (value: string) => void;
    idField: string;
    setIdField: (value: string) => void;
    isStopOnError: boolean;
    setIsStopOnError: (value: boolean) => void;

    displayStatus: string;
    infoIconFunctionString: string;
    formatterFn: string;
    validateFormatterFn: (code: string) => Promise<boolean>;
}


const ImportOptions = ({
    keyPrefix,
    setKeyPrefix,
    idField,
    setIdField,
    isStopOnError,
    setIsStopOnError,
    displayStatus,
    infoIconFunctionString,
    formatterFn,
    validateFormatterFn,
}: ImportOptionsProps) => {

    return (
        <div className="import-options-container  fade-in-out-to-top">
            <fieldset>

                <legend className="roboto-bold-italic">Options</legend>
                <div className="options">

                    <div className="options-row">
                        <div>
                            <div className="import-option-title roboto-medium"> Key prefix</div>

                            <input type="text" className="pg001-textbox"
                                placeholder="products:"
                                value={keyPrefix}
                                onChange={(e) => setKeyPrefix(e.target.value)}
                                tabIndex={3}
                                disabled={!!displayStatus}
                            />
                        </div>
                        <div>
                            <div className="import-option-title roboto-medium">
                                ID field
                                <div className="fas fa-info-circle options-info-icon" title="ID field JSON property or path in the final formatted JSON output"></div>
                            </div>
                            <input type="text" className="pg001-textbox"
                                placeholder="productId"
                                value={idField}
                                onChange={(e) => setIdField(e.target.value)}
                                tabIndex={4}
                                disabled={!!displayStatus}

                            />
                        </div>
                        <div className="options-col">
                            <input type="checkbox" className="pg001-checkbox"
                                id="import-check-stop-on-error"
                                checked={isStopOnError}
                                onChange={(e) => setIsStopOnError(e.target.checked)}
                                tabIndex={5}
                                disabled={displayStatus == IMPORT_STATUS.IN_PROGRESS}
                            />
                            <label htmlFor="import-check-stop-on-error" className="roboto-medium stop-on-error-lbl">Stop on error</label>
                        </div>
                    </div>
                    <div className="import-formatter-func-section">
                        <div className="import-formatter-func-title-container">
                            <div className="import-option-title roboto-medium" >Formatter function</div>

                            <div className="import-formatter-func-icon-container">
                                <div className="fas fa-info-circle import-formatter-func-icon"></div>
                                <div className="import-formatter-func-info-container">
                                    <div className="pg001-triangle-arrow-top"></div>
                                    <div className="import-formatter-func-info-body">

                                        <CodeMirrorEditor
                                            initialValue={infoIconFunctionString}
                                            className="import-formatter-func-textarea"
                                            disabled={true}
                                        />
                                    </div>
                                </div>
                            </div>


                        </div>
                        <div className="import-formatter-func-field">

                            <CodeMirrorEditor
                                initialValue={formatterFn}
                                className="import-formatter-func-textarea"
                                onBlur={validateFormatterFn}
                                tabIndex={6}
                                disabled={!!displayStatus}
                            />
                        </div>
                    </div>
                </div>
            </fieldset>
        </div>
    );
}

export default ImportOptions;