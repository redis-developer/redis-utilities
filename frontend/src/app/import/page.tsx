"use client";

import type { ImportFileError } from "../types";
import React, { useEffect, useState } from "react";

import '../common/css/typography.css';
import '../common/css/variables.css';
import '../common/css/theme.css';

import './page.css';

import PageHeader from '../components/PageHeader';
import ImportOptions from './page-components/ImportOptions';

import {
    testRedisConnection,
    importDataToRedis,
    resumeImportDataToRedis,
    testJSONFormatterFn,
    getSampleInputForJSONFormatterFn,
} from "../utils/services";
import { errorToast, infoToast } from "../utils/toast-util";
import { encryptData } from "../utils/crypto-util";

import {
    IMPORT_ANIMATE_CSS,
    IMPORT_STATUS,
    IMPORT_PAGE_TABS,
    UPLOAD_TYPES_OPTIONS,
    UPLOAD_TYPES_FOR_IMPORT,
} from "../constants";
import { config } from "../config";

import { useSocket } from "./use-socket";


const infoIconFunctionString = `function customJSONFormatter(jsonObj){

// Can modify jsonObj as needed

jsonObj.insertedAt = new Date() // add new field
jsonObj.brandName = jsonObj.brandName.toUpperCase() //update field
delete jsonObj.meta //delete field

// OR can assign new jsonObj

jsonObj = {
  productId: jsonObj.id,
  productName: jsonObj.productDisplayName,
  price: jsonObj.price,
  insertedAt: new Date(),
}

 return jsonObj; // mandatory return 
}`;

const defaultFunctionString = `function customJSONFormatter(jsonObj){



 return jsonObj; // mandatory return 
}`;

const Page = () => {

    const [testRedisUrl, setTestRedisUrl] = useState(config.DEFAULT_REDIS_URL);

    const [redisConUrl, setRedisConUrl] = useState('');
    const [uploadPath, setUploadPath] = useState('');
    const [keyPrefix, setKeyPrefix] = useState('');
    const [idField, setIdField] = useState('');
    const [isStopOnError, setIsStopOnError] = useState(true);

    const [formatterFn, setFormatterFn] = useState(defaultFunctionString);
    const [formatterFnInput, setFormatterFnInput] = useState<any>({});
    const [formatterFnOutput, setFormatterFnOutput] = useState<any>(null);
    const [isValidFormatterFn, setIsValidFormatterFn] = useState(false);

    const [activeTabIndex, setActiveTabIndex] = useState(IMPORT_PAGE_TABS.LOGS);
    const [isShowLoader, setIsShowLoader] = useState(false);
    const [uploadTypeOption, setUploadTypeOption] = useState(UPLOAD_TYPES_OPTIONS[0]);

    const gitTag = config.GIT_TAG;

    const {
        socketId,
        displayStats, setDisplayStats,
        displayErrors, setDisplayErrors,
        displayStatus, setDisplayStatus,
        bodyClasses, setBodyClasses,
        addToSet, removeFromSet,
        pauseImportFilesToRedis
    } = useSocket();

    useEffect(() => {

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            evtClickPause();
            event.preventDefault();
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };

    }, []);


    const evtClickEnterConUrl = async () => {

        if (testRedisUrl) {
            setRedisConUrl("");
            setIsShowLoader(true);

            const encryptedRedisUrl = await encryptData(testRedisUrl);
            const result = await testRedisConnection({
                redisConUrlEncrypted: encryptedRedisUrl
            });
            if (result?.data) {
                setRedisConUrl(testRedisUrl);

                addToSet(setBodyClasses, IMPORT_ANIMATE_CSS.CHOOSE_UPLOAD_PATH);
            }
            setIsShowLoader(false);

        }
    }

    const validateUploadPath = () => {
        let isValid = false;

        if (uploadPath) {
            if (uploadTypeOption.value === UPLOAD_TYPES_FOR_IMPORT.JSON_ARRAY_FILE) {
                isValid = !!(uploadPath.match(/\.json$/)?.length);
            }
            else if (uploadTypeOption.value === UPLOAD_TYPES_FOR_IMPORT.CSV_FILE) {
                isValid = !!(uploadPath.match(/\.csv$/)?.length);
            }
            else if (uploadTypeOption.value === UPLOAD_TYPES_FOR_IMPORT.JSON_FOLDER) {
                // should not end with any file extension
                isValid = !(uploadPath.match(/\.\w+$/)?.length);
            }

        }

        return isValid;
    }

    const evtClickEnterUploadPath = async () => {

        const isValid = validateUploadPath();
        if (!isValid) {
            errorToast("Invalid upload path!");
        }
        else {

            setIsShowLoader(true);

            const result = await getSampleInputForJSONFormatterFn({
                uploadType: uploadTypeOption.value,
                uploadPath: uploadPath
            });
            if (result?.data?.content) {
                console.log("sample file path :", result.data?.filePath);
                console.log("sample file data :", result.data.content);
                setFormatterFnInput(result.data.content);

                removeFromSet(setBodyClasses, IMPORT_ANIMATE_CSS.CHOOSE_UPLOAD_PATH);
                addToSet(setBodyClasses, IMPORT_ANIMATE_CSS.SHOW_IMPORT_PROCESS_CTR);
            }
            else if (result?.error) {
                setFormatterFnInput({});
            }
            setIsShowLoader(false);

        }

    }

    const startImportFiles = async () => {
        setDisplayErrors([]);

        const encryptedRedisUrl = await encryptData(redisConUrl);

        const result = await importDataToRedis({
            redisConUrlEncrypted: encryptedRedisUrl,
            uploadType: uploadTypeOption.value,
            uploadPath,
            keyPrefix,
            idField,
            socketId,
            isStopOnError,
            jsFunctionString: formatterFn
        });

        if (result?.data?.stats) {
            setDisplayStats(result.data.stats);
        }
        if (result?.data?.currentStatus) {
            setDisplayStatus(result.data.currentStatus);
        }
    }
    const resumeImportFiles = async () => {

        const result = await resumeImportDataToRedis({
            socketId,
            isStopOnError,
            uploadType: uploadTypeOption.value,
            uploadPath: uploadPath
        });

        if (result?.data?.stats) {
            setDisplayStats(result.data.stats);
        }
        if (result?.data?.currentStatus) {
            setDisplayStatus(result.data.currentStatus);
        }
    }
    const evtClickPlay = async () => {

        if (!displayStatus) { // first time
            const isValid = await validateFormatterFn(formatterFn);

            if (isValid) {
                removeFromSet(setBodyClasses, IMPORT_ANIMATE_CSS.IMPORT_PAUSE);
                addToSet(setBodyClasses, IMPORT_ANIMATE_CSS.IMPORT_START);

                await startImportFiles();
            }

        } else if (displayStatus != IMPORT_STATUS.IN_PROGRESS) {
            removeFromSet(setBodyClasses, IMPORT_ANIMATE_CSS.IMPORT_PAUSE);

            await resumeImportFiles();
        }

    }

    const evtClickPause = () => {
        addToSet(setBodyClasses, IMPORT_ANIMATE_CSS.IMPORT_PAUSE);
        pauseImportFilesToRedis();
    }

    const validateFormatterFn = async (code: string) => {
        let isValid = false;

        if (!code) {
            code = "";
        }

        setFormatterFn(code);

        const testResult = await testJSONFormatterFn({ // validate key & formatter function
            idField: idField,
            keyPrefix: keyPrefix,

            jsFunctionString: code,
            paramsObj: formatterFnInput
        });

        if (testResult?.data) {
            isValid = true;
            setFormatterFnOutput(testResult?.data);
            setActiveTabIndex(IMPORT_PAGE_TABS.LOGS)
        }
        else if (testResult?.error) {
            isValid = false;
            const displayError: ImportFileError = {
                message: "Error in Import Options ",
                error: testResult?.error
            };
            setDisplayErrors((prev) => [...prev, displayError]);
            setActiveTabIndex(IMPORT_PAGE_TABS.ERRORS);
        }
        else if (code == "") {
            isValid = true;
            setFormatterFnOutput(formatterFnInput);
            setActiveTabIndex(IMPORT_PAGE_TABS.LOGS)
        }

        setIsValidFormatterFn(isValid);
        scrollTabContainer();

        return isValid;
    }

    const handleUploadTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = e.target.value;
        const selectedOption = UPLOAD_TYPES_OPTIONS.find(option => option.value === selectedValue);
        if (selectedOption) {
            setUploadTypeOption(selectedOption);
        }
    };

    const scrollTabContainer = () => {

        setTimeout(() => {
            const tabContainer = document.querySelector(".tab-container:not(.hide-tab-container)");
            if (tabContainer) {
                tabContainer.scrollTop = tabContainer.scrollHeight;
            }
        }, 10);

    }

    return (
        <div className={"pg001-body roboto-regular "
            + (displayErrors.length ? "import-error " : "")
            + Array.from(bodyClasses).join(" ")
        }
            id="pg001-body">

            <div className="pg001-outer-container">
                <PageHeader isShowLoader={isShowLoader} headerIconCls="fas fa-file-import" headerLabel="Import Tool" pageVersion={gitTag} />
                <div className="con-url-outer-container">
                    <div className="con-url-container">
                        <div className="con-url-lbl roboto-medium pg001-single-line-label">Connection URL : </div>

                        <input type="text"
                            placeholder="Enter Redis Connection URL"
                            className="con-url-textbox pg001-textbox"
                            value={testRedisUrl}
                            onChange={(e) => setTestRedisUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key.toLowerCase() === 'enter') {
                                    evtClickEnterConUrl();
                                }
                            }}
                            tabIndex={1}
                        />

                        <div className="fas fa-arrow-circle-right con-url-submit-icon enter"
                            title="Next"
                            onClick={evtClickEnterConUrl}></div>
                        <div className="fas fa-check-circle con-url-submit-icon done" title="Connection successful"></div>
                    </div>
                </div>
                <div className="upload-path-outer-container">
                    <div className="upload-path-container fade-in-out-to-top">
                        <div className="upload-path-select-ctr">

                            <span className="pg001-upload-lbl roboto-medium pg001-single-line-label">
                                Upload Type :
                            </span>

                            <select value={uploadTypeOption.value} onChange={handleUploadTypeChange} className="pg001-select" >
                                {UPLOAD_TYPES_OPTIONS.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="upload-path-textbox-ctr">
                            <span className="pg001-upload-lbl roboto-medium pg001-single-line-label">
                                Upload Path :
                            </span>
                            <input type="text" className="upload-path-textbox pg001-textbox"
                                placeholder={uploadTypeOption.placeholder}
                                id="upload-path-textbox"
                                value={uploadPath}
                                onChange={(e) => setUploadPath(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key.toLowerCase() === 'enter') {
                                        evtClickEnterUploadPath();
                                    }
                                }}
                                tabIndex={2}
                            />

                            <div className="fas fa-arrow-circle-right upload-path-submit-icon"
                                title="Next"
                                onClick={evtClickEnterUploadPath}></div>
                        </div>


                    </div>
                </div>
                <div className="import-process-outer-container">
                    <div id="final-upload-path-container" className="final-upload-path-container fade-in-out-to-top">
                        <div className="far fa-folder folder-icon"></div>
                        <div className="pg001-single-line-label roboto-medium">Upload Path : </div>
                        <div id="final-upload-path" className="final-upload-path">{uploadPath}</div>
                    </div>
                    <div className="import-process-container">

                        <div className="import-process-left-container">

                            <ImportOptions
                                keyPrefix={keyPrefix} setKeyPrefix={setKeyPrefix}
                                idField={idField} setIdField={setIdField}
                                isStopOnError={isStopOnError} setIsStopOnError={setIsStopOnError}
                                displayStatus={displayStatus}
                                infoIconFunctionString={infoIconFunctionString}
                                formatterFn={formatterFn} validateFormatterFn={validateFormatterFn}
                            />
                            <div className="action-container fade-in-out-to-top">
                                {displayStatus != IMPORT_STATUS.IN_PROGRESS ? (
                                    <div className="action-icons fas fa-play" title="Start/ Resume Import"
                                        onClick={() => evtClickPlay()}
                                        onKeyDown={(e) => {
                                            if (e.key.toLowerCase() === 'enter' || e.key === ' ') {
                                                evtClickPlay();
                                            }
                                        }}
                                        tabIndex={7} ></div>
                                ) : (
                                    <div className="action-icons fas fa-pause" title="Pause Import"
                                        onClick={() => evtClickPause()}
                                        onKeyDown={(e) => {
                                            if (e.key.toLowerCase() === 'enter' || e.key === ' ') {
                                                evtClickPause();
                                            }
                                        }}
                                        tabIndex={8}></div>
                                )}
                            </div>
                            <div className="count-outer-container fade-in-out-to-top">
                                <div className="count-container success-count-container">
                                    <div className="success-count-icon fas fa-check"></div>
                                    <div className="import-success-count">
                                        {displayStats.processed} out of {displayStats.totalFiles}
                                    </div>
                                </div>
                                <div className="count-container error-count-container fade-in-out-to-top">
                                    <div className="error-count-icon fas fa-times"></div>
                                    <div className="import-error-count" title="View Error" onClick={() => {
                                        setActiveTabIndex(IMPORT_PAGE_TABS.ERRORS);
                                        scrollTabContainer();
                                    }}> {displayStats.failed} failed</div>
                                </div>
                            </div>
                        </div>

                        <div className="import-process-right-container">
                            <div className="tabs-outer-container fade-in-out-to-left">
                                <div className="tab-headings">

                                    <div className={"tab-title roboto-medium "
                                        + (activeTabIndex == IMPORT_PAGE_TABS.LOGS ? "tab-title-active" : "")}
                                        onClick={() => setActiveTabIndex(IMPORT_PAGE_TABS.LOGS)}>
                                        Info
                                    </div>

                                    <div className={"tab-title roboto-medium "
                                        + (activeTabIndex == IMPORT_PAGE_TABS.ERRORS ? "tab-title-active" : "")}
                                        onClick={() => setActiveTabIndex(IMPORT_PAGE_TABS.ERRORS)}>
                                        ErrorLogs ({displayErrors.length})
                                    </div>
                                </div>
                                <div className={"tab-container "
                                    + (activeTabIndex == IMPORT_PAGE_TABS.ERRORS ? "hide-tab-container" : "")}>

                                    <div className="tab-container-status roboto-bold-italic">
                                        Status : {displayStatus || "Not started"}
                                    </div>
                                    {formatterFnInput &&
                                        <>
                                            <hr />
                                            <details>
                                                <summary className="summary-tag roboto-medium-italic">
                                                    Formatter function input (jsonObj) is file content :
                                                </summary>

                                                <pre>
                                                    <code>
                                                        {JSON.stringify(formatterFnInput, null, 4)}
                                                    </code>
                                                </pre>
                                            </details>
                                        </>
                                    }
                                    {formatterFnOutput &&
                                        <>
                                            <hr />

                                            <details>
                                                <summary className="summary-tag roboto-medium-italic">
                                                    Formatter function output to be stored in Redis :
                                                </summary>
                                                <pre>
                                                    <code>
                                                        {JSON.stringify(formatterFnOutput, null, 4)}
                                                    </code>
                                                </pre>
                                            </details>
                                        </>
                                    }

                                </div>
                                <div className={"tab-container "
                                    + (activeTabIndex == IMPORT_PAGE_TABS.LOGS ? "hide-tab-container" : "")}>

                                    {displayErrors.map((error, index) => (
                                        <div key={index} className="error-log">
                                            <div className="error-log-path">
                                                {index + 1})
                                                {error.filePath ? 'FilePath : ' + error.filePath : ''}
                                                {error.message ? ' Message : ' + error.message : ''}
                                            </div>
                                            <div className="error-log-msg">
                                                {/* Error : */}
                                                <pre>
                                                    <code>
                                                        {JSON.stringify(error.error, null, 4)}
                                                    </code>
                                                </pre>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
};

export default Page;