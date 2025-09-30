import React, { useState, useCallback, useMemo } from 'react';
import type { ComparisonRow } from './types';
import { generateSummary, generateComparisonTable, generateCounterArguments, structureMyArguments, summarizeDocument, evaluateEvidence } from './services/geminiService';
import Spinner from './components/Spinner';
import Icon from './components/Icon';

// Helper function to format file size
const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

type LawsuitType = 'civil' | 'criminal';

const App: React.FC = () => {
    // State management
    const [lawsuitType, setLawsuitType] = useState<LawsuitType | null>(null);
    
    const [plaintiffArgument, setPlaintiffArgument] = useState('');
    const [defendantArgument, setDefendantArgument] = useState('');
    const [plaintiffEvidenceFile, setPlaintiffEvidenceFile] = useState<File | null>(null);
    const [defendantEvidenceFile, setDefendantEvidenceFile] = useState<File | null>(null);
    
    // Drag & Drop states
    const [plaintiffIsDragging, setPlaintiffIsDragging] = useState(false);
    const [defendantIsDragging, setDefendantIsDragging] = useState(false);
    const [plaintiffIsDraggingText, setPlaintiffIsDraggingText] = useState(false);
    const [defendantIsDraggingText, setDefendantIsDraggingText] = useState(false);
    
    // Summaries from inputs
    const [plaintiffSummary, setPlaintiffSummary] = useState('');
    const [defendantSummary, setDefendantSummary] = useState('');
    
    // Evaluation results
    const [plaintiffEvaluation, setPlaintiffEvaluation] = useState('');
    const [defendantEvaluation, setDefendantEvaluation] = useState('');
    
    const [keyIssues, setKeyIssues] = useState('');
    const [mySide, setMySide] = useState<'plaintiff' | 'defendant'>('plaintiff');
    const [myArgs, setMyArgs] = useState(''); 

    // Loading states
    const [loading, setLoading] = useState(false);
    const [summarizing, setSummarizing] = useState<'plaintiff' | 'defendant' | null>(null);
    const [evaluating, setEvaluating] = useState<'plaintiff' | 'defendant' | null>(null);
    
    // Error states
    const [error, setError] = useState<string | null>(null);
    const [summaryError, setSummaryError] = useState<{ party: 'plaintiff' | 'defendant', message: string } | null>(null);
    const [plaintiffFileError, setPlaintiffFileError] = useState<string | null>(null);
    const [defendantFileError, setDefendantFileError] = useState<string | null>(null);
    const [plaintiffArgFileError, setPlaintiffArgFileError] = useState<string | null>(null);
    const [defendantArgFileError, setDefendantArgFileError] = useState<string | null>(null);

    // AI Analysis Results
    const [summaryResult, setSummaryResult] = useState('');
    const [comparisonResult, setComparisonResult] = useState<ComparisonRow[]>([]);
    const [counterResult, setCounterResult] = useState('');
    const [structureResult, setStructureResult] = useState('');
    
    const [copySuccess, setCopySuccess] = useState(false);

    const partyNames = useMemo(() => {
        switch (lawsuitType) {
            case 'civil':
                return { plaintiff: '원고', defendant: '피고' };
            case 'criminal':
                return { plaintiff: '검사', defendant: '피고인' };
            default:
                return { plaintiff: '원고', defendant: '피고' }; // Fallback
        }
    }, [lawsuitType]);


    const handleSummarize = async (party: 'plaintiff' | 'defendant') => {
        const argument = party === 'plaintiff' ? plaintiffArgument : defendantArgument;
        const evidenceFile = party === 'plaintiff' ? plaintiffEvidenceFile : defendantEvidenceFile;

        if (!argument && !evidenceFile) {
            setSummaryError({party, message: '요약할 주장이나 증거를 입력해주세요.'});
            return;
        }

        setSummarizing(party);
        setSummaryError(null);
        setError(null);

        try {
            const summary = await summarizeDocument(argument, evidenceFile);
            if (party === 'plaintiff') {
                setPlaintiffSummary(summary);
            } else {
                setDefendantSummary(summary);
            }
        } catch (e) {
            if (e instanceof Error) {
                setSummaryError({ party, message: e.message });
            } else {
                setSummaryError({ party, message: '알 수 없는 오류 발생' });
            }
        } finally {
            setSummarizing(null);
        }
    };

    const handleEvaluate = async (party: 'plaintiff' | 'defendant') => {
        const argument = party === 'plaintiff' ? plaintiffArgument : defendantArgument;
        const evidenceFile = party === 'plaintiff' ? plaintiffEvidenceFile : defendantEvidenceFile;

        if (!argument || !evidenceFile) {
            setSummaryError({ party, message: '평가를 위해 주장과 증거를 모두 입력해주세요.' });
            return;
        }

        setEvaluating(party);
        setSummaryError(null);
        setError(null);

        try {
            const evaluation = await evaluateEvidence(argument, evidenceFile);
            if (party === 'plaintiff') {
                setPlaintiffEvaluation(evaluation);
            } else {
                setDefendantEvaluation(evaluation);
            }
        } catch (e) {
            if (e instanceof Error) {
                setSummaryError({ party, message: e.message });
            } else {
                setSummaryError({ party, message: '알 수 없는 오류 발생' });
            }
        } finally {
            setEvaluating(null);
        }
    };


    const handleGenerate = useCallback(async () => {
        setLoading(true);
        setError(null);
        setCopySuccess(false);
        setSummaryResult('');
        setComparisonResult([]);
        setCounterResult('');
        setStructureResult('');

        try {
            const opponentSummary = mySide === 'plaintiff' ? defendantSummary : plaintiffSummary;
            const mySideName = mySide === 'plaintiff' ? partyNames.plaintiff : partyNames.defendant;
            const opponentSideName = mySide === 'plaintiff' ? partyNames.defendant : partyNames.plaintiff;

            if (!opponentSummary) {
                throw new Error("상대방의 주장을 먼저 요약해주세요.");
            }

            const mySummary = mySide === 'plaintiff' ? plaintiffSummary : defendantSummary;
            if (!mySummary && !myArgs) {
                 throw new Error(`정리할 나의 주장이 없습니다. ${partyNames[mySide]}측 주장을 요약하거나 직접 입력해주세요.`);
            }
            const argsToStructure = myArgs || mySummary;

            const [summary, comparison, counter, structured] = await Promise.all([
                generateSummary(plaintiffSummary, defendantSummary),
                generateComparisonTable(plaintiffSummary, defendantSummary, keyIssues),
                generateCounterArguments(opponentSummary, mySideName, opponentSideName),
                structureMyArguments(argsToStructure, keyIssues)
            ]);
            
            setSummaryResult(summary);
            setComparisonResult(comparison);
            setCounterResult(counter);
            setStructureResult(structured);

        } catch (e) {
            if (e instanceof Error) {
                setError(e.message);
            } else {
                setError("AI 분석 중 알 수 없는 오류가 발생했습니다.");
            }
        } finally {
            setLoading(false);
        }
    }, [plaintiffSummary, defendantSummary, keyIssues, mySide, myArgs, partyNames]);

    const renderPartyInput = (party: 'plaintiff' | 'defendant', partyName: string) => {
        const argument = party === 'plaintiff' ? plaintiffArgument : defendantArgument;
        const setArgument = party === 'plaintiff' ? setPlaintiffArgument : setDefendantArgument;
        const evidenceFile = party === 'plaintiff' ? plaintiffEvidenceFile : defendantEvidenceFile;
        const setEvidenceFile = party === 'plaintiff' ? setPlaintiffEvidenceFile : setDefendantEvidenceFile;
        const summary = party === 'plaintiff' ? plaintiffSummary : defendantSummary;
        const evaluation = party === 'plaintiff' ? plaintiffEvaluation : defendantEvaluation;
        const currentError = summaryError?.party === party ? summaryError.message : null;
        const isSummarizing = summarizing === party;
        const isEvaluating = evaluating === party;
        
        const isDragging = party === 'plaintiff' ? plaintiffIsDragging : defendantIsDragging;
        const setIsDragging = party === 'plaintiff' ? setPlaintiffIsDragging : setDefendantIsDragging;
        const fileError = party === 'plaintiff' ? plaintiffFileError : defendantFileError;
        const setFileError = party === 'plaintiff' ? setPlaintiffFileError : setDefendantFileError;

        const isDraggingText = party === 'plaintiff' ? plaintiffIsDraggingText : defendantIsDraggingText;
        const setIsDraggingText = party === 'plaintiff' ? setPlaintiffIsDraggingText : setDefendantIsDraggingText;
        const argFileError = party === 'plaintiff' ? plaintiffArgFileError : defendantArgFileError;
        const setArgFileError = party === 'plaintiff' ? setPlaintiffArgFileError : setDefendantArgFileError;


        const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            setFileError(null);
            if (e.target.files?.[0]) {
                const file = e.target.files[0];
                const isPdfFile = file.type === 'application/pdf';
                const isImageFile = file.type.startsWith('image/');

                if (isPdfFile || isImageFile) {
                    setEvidenceFile(file);
                } else {
                    setFileError('지원되지 않는 파일 형식입니다. PDF 또는 이미지 파일을 업로드해주세요.');
                }
            }
        };
        
        const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(true);
        };
        const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
        };
        const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);
            setFileError(null);
    
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFile = e.dataTransfer.files[0];
                const isPdfFile = droppedFile.type === 'application/pdf';
                const isImageFile = droppedFile.type.startsWith('image/');
                
                if (isPdfFile || isImageFile) {
                     setEvidenceFile(droppedFile);
                } else {
                    setFileError(`지원되지 않는 파일 형식입니다. PDF 또는 이미지 파일을 업로드해주세요.`);
                }
                e.dataTransfer.clearData();
            }
        };
        
        const handleRemoveFile = () => {
            setEvidenceFile(null);
            setFileError(null);
            const fileInput = document.getElementById(`${party}-file-input`) as HTMLInputElement;
            if (fileInput) {
                fileInput.value = '';
            }
        };

        const handleArgDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingText(true);
        };
        const handleArgDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingText(false);
        };
        const handleArgDragOver = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
        };
        const handleArgDrop = (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingText(false);
            setArgFileError(null);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile.type === 'text/plain') {
                    const reader = new FileReader();
                    reader.onload = (readEvent) => {
                        if (readEvent.target?.result) {
                            setArgument(readEvent.target.result as string);
                        }
                    };
                    reader.onerror = () => setArgFileError('파일을 읽는 데 실패했습니다.');
                    reader.readAsText(droppedFile);
                } else {
                    setArgFileError('텍스트 파일(.txt)만 드롭할 수 있습니다.');
                }
                e.dataTransfer.clearData();
            }
        };

        const isSummarizeDisabled = (!argument && !evidenceFile) || isSummarizing || isEvaluating;
        const isEvaluateDisabled = !argument || !evidenceFile || isSummarizing || isEvaluating;

        return (
            <div className="bg-white p-4 rounded-lg border border-slate-200 flex-1 min-w-[300px] flex flex-col">
                <h3 className="font-bold text-lg text-slate-800 mb-3">{partyName} 측 자료</h3>
                
                <div className='space-y-3'>
                    <div>
                         <label htmlFor={`${party}-argument`} className="block text-sm font-medium text-slate-700 mb-1">
                            주장 <span className="font-normal text-slate-500">(텍스트 파일을 드래그하여 입력)</span>
                        </label>
                        <div
                            onDrop={handleArgDrop}
                            onDragOver={handleArgDragOver}
                            onDragEnter={handleArgDragEnter}
                            onDragLeave={handleArgDragLeave}
                            className={`relative transition-colors duration-200 rounded-md ${isDraggingText ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
                        >
                            <textarea 
                                id={`${party}-argument`}
                                rows={4}
                                className={`block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 transition-opacity bg-white text-slate-900 placeholder:text-slate-400 ${isDraggingText ? 'opacity-50' : ''}`}
                                placeholder="주요 주장 내용을 입력하거나 .txt 파일을 드래그하세요."
                                value={argument}
                                onChange={(e) => setArgument(e.target.value)}
                            />
                             {isDraggingText && (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-md pointer-events-none">
                                    <p className="font-semibold text-blue-600">텍스트 파일 놓기</p>
                                </div>
                            )}
                        </div>
                        <div className="h-4">
                            {argFileError && <p className="text-xs text-red-600 mt-1">{argFileError}</p>}
                        </div>
                    </div>
                    <div>
                         <label htmlFor={`${party}-evidence`} className="block text-sm font-medium text-slate-700 mb-1">
                            증거 자료 (PDF, 이미지)
                        </label>
                        <div 
                            onDrop={handleDrop} 
                            onDragOver={handleDragOver} 
                            onDragEnter={handleDragEnter} 
                            onDragLeave={handleDragLeave}
                            className={`relative border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 h-36 flex items-center justify-center ${isDragging ? 'border-solid border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400'}`}
                        >
                            {isDragging ? (
                                <div className="flex flex-col items-center justify-center pointer-events-none">
                                    <svg className="w-12 h-12 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l-3.75 3.75M12 9.75l3.75 3.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="mt-2 text-sm font-semibold text-blue-600">이제 파일을 놓으세요</p>
                                </div>
                            ) : evidenceFile ? (
                                <div className="flex flex-col items-center justify-center h-full">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <p className="mt-1 text-sm font-semibold text-slate-800 truncate w-full px-2" title={evidenceFile.name}>{evidenceFile.name}</p>
                                    <p className="text-xs text-slate-500">{formatBytes(evidenceFile.size)}</p>
                                    <button
                                        type="button"
                                        onClick={handleRemoveFile}
                                        className="mt-2 text-xs font-medium text-red-600 hover:text-red-800 focus:outline-none"
                                        aria-label="Remove file"
                                    >
                                        제거
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <input 
                                        type="file" 
                                        id={`${party}-file-input`}
                                        accept=".pdf,image/*" 
                                        onChange={handleFileChange} 
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <label htmlFor={`${party}-file-input`} className="flex flex-col items-center justify-center cursor-pointer w-full h-full">
                                            <svg className="w-10 h-10 text-slate-400" aria-hidden="true" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                                            <p className="mt-2 text-sm text-slate-600">
                                                파일을 드래그하거나 <span className="font-semibold text-blue-600">클릭하여 업로드</span>
                                            </p>
                                    </label>
                                </>
                            )}
                        </div>
                         <div className="h-4">
                            {fileError && <p className="text-xs text-red-600 mt-1">{fileError}</p>}
                        </div>
                    </div>
                </div>
                
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                     <button 
                        onClick={() => handleSummarize(party)}
                        disabled={isSummarizeDisabled}
                        className="text-sm w-full inline-flex items-center justify-center px-3 py-2 border border-transparent font-medium rounded-md shadow-sm text-white bg-slate-600 hover:bg-slate-700 disabled:bg-slate-300"
                    >
                        {isSummarizing ? <><Spinner/> 요약 중...</> : '주장/증거 요약하기'}
                    </button>
                    <button 
                        onClick={() => handleEvaluate(party)}
                        disabled={isEvaluateDisabled}
                        className="text-sm w-full inline-flex items-center justify-center px-3 py-2 border border-blue-600 font-medium rounded-md shadow-sm text-blue-700 bg-blue-100 hover:bg-blue-200 disabled:bg-slate-300 disabled:text-slate-500 disabled:border-transparent"
                    >
                        {isEvaluating ? <><Spinner/> 평가 중...</> : '증거 평가하기'}
                    </button>
                </div>
                {currentError && <p className="text-xs text-red-600 mt-1">{currentError}</p>}

                {(summary || evaluation) && <div className="mt-4 pt-3 border-t border-slate-200 space-y-3 flex-grow">
                    {summary && (
                        <div>
                            <h4 className="font-semibold text-sm text-slate-800 mb-1">요약 결과</h4>
                            <div className="text-sm bg-slate-50 p-2 rounded whitespace-pre-wrap text-slate-700">{summary}</div>
                        </div>
                    )}
                    {evaluation && (
                        <div>
                            <h4 className="font-semibold text-sm text-slate-800 mb-1">증거 평가 결과</h4>
                            <div className="text-sm bg-blue-50 p-2 rounded whitespace-pre-wrap text-slate-700" dangerouslySetInnerHTML={{ __html: evaluation.replace(/\n/g, '<br />') }}></div>
                        </div>
                    )}
                </div>}
            </div>
        )
    };
    
    const isGenerateDisabled = () => {
        return loading || !plaintiffSummary || !defendantSummary || !keyIssues;
    }

    const hasResults = useMemo(() => {
        return summaryResult || comparisonResult.length > 0 || counterResult || structureResult;
    }, [summaryResult, comparisonResult, counterResult, structureResult]);

    const getResultAsText = () => {
        let fullText = '';

        if (summaryResult) {
            fullText += '--- 사건 요약 ---\n\n' + summaryResult + '\n\n';
        }
    
        if (Array.isArray(comparisonResult) && comparisonResult.length > 0) {
            const comparisonText = comparisonResult.map(row => 
                `[쟁점]: ${row.issue}\n\n` +
                `  - ${partyNames.plaintiff} 주장: ${row.plaintiff_argument}\n` +
                `  - ${partyNames.plaintiff} 증거: ${row.plaintiff_evidence}\n\n` +
                `  - ${partyNames.defendant} 주장: ${row.defendant_argument}\n` +
                `  - ${partyNames.defendant} 증거: ${row.defendant_evidence}\n` +
                `---------------------------------\n`
            ).join('\n');
            fullText += '--- 쟁점별 비교 ---\n\n' + comparisonText + '\n\n';
        }
    
        if (counterResult) {
            fullText += '--- 반박 논거 ---\n\n' + counterResult + '\n\n';
        }
    
        if (structureResult) {
            fullText += '--- 내 주장 정리 ---\n\n' + structureResult + '\n\n';
        }
    
        return fullText.trim();
    };

    const handleCopy = () => {
        const textToCopy = getResultAsText();
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                setCopySuccess(true);
                setTimeout(() => setCopySuccess(false), 2000);
            }, () => {
                setError("클립보드 복사에 실패했습니다.");
            });
        }
    };
    
    const handleDownload = () => {
        const content = getResultAsText();
        const filename = `legal_analysis_result.txt`;
        if (content) {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    };
    
    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <header className="text-center mb-10">
                    <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">법적 사건 분석 및 대응 전략 도우미</h1>
                    <p className="mt-3 max-w-2xl mx-auto text-lg text-slate-600">AI를 활용하여 복잡한 법률 사건을 명확하게 분석하고 효과적인 전략을 수립하세요.</p>
                </header>

                <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg">
                    
                    {!lawsuitType ? (
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-slate-900">1. 소송 종류 선택</h2>
                            <p className="text-slate-600 mt-2 mb-6">분석할 소송의 종류를 선택해주세요. 당사자 명칭이 결정됩니다.</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md mx-auto">
                                <button onClick={() => setLawsuitType('civil')} className="p-6 rounded-lg border-2 text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50 focus:ring-blue-500">
                                    <span className="font-bold text-lg text-slate-900">민사 소송</span>
                                    <span className="block mt-1 text-sm text-slate-600">원고 vs 피고</span>
                                </button>
                                <button onClick={() => setLawsuitType('criminal')} className="p-6 rounded-lg border-2 text-center transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 border-slate-300 bg-white hover:border-blue-500 hover:bg-blue-50 focus:ring-blue-500">
                                    <span className="font-bold text-lg text-slate-900">형사 소송</span>
                                    <span className="block mt-1 text-sm text-slate-600">검사 vs 피고인</span>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-xl font-bold text-slate-900">1. 자료 입력 및 분석</h2>
                                    <button onClick={() => setLawsuitType(null)} className="text-sm font-medium text-blue-600 hover:text-blue-800">소송 종류 변경</button>
                                </div>
                                <div className="flex flex-col md:flex-row gap-4">
                                {renderPartyInput('plaintiff', partyNames.plaintiff)}
                                {renderPartyInput('defendant', partyNames.defendant)}
                                </div>
                            </div>

                            <div className="mt-10">
                                <h2 className="text-xl font-bold text-slate-900">2. AI 종합 분석</h2>
                                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200 mt-4">
                                    <div className="space-y-6">
                                        <div>
                                            <label htmlFor="key-issues" className="block text-sm font-medium text-slate-700 mb-1">
                                                주요 쟁점
                                            </label>
                                            <textarea
                                                id="key-issues"
                                                rows={3}
                                                className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white text-slate-900"
                                                placeholder="사건의 핵심 쟁점을 입력하세요. (예: 계약의 유효성, 손해배상액의 범위 등)"
                                                value={keyIssues}
                                                onChange={(e) => setKeyIssues(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-medium text-slate-700 mb-2">나의 입장 선택</h3>
                                            <p className="text-sm text-slate-500 mb-3">어느 입장에서 상대방의 주장을 반박하고 내 주장을 정리할지 선택하세요.</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setMySide('plaintiff')}
                                                    className={`p-4 rounded-lg border-2 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${ mySide === 'plaintiff' ? 'border-blue-500 bg-blue-50 focus:ring-blue-500' : 'border-slate-300 bg-white hover:border-slate-400 focus:ring-slate-400' }`}
                                                    aria-pressed={mySide === 'plaintiff'}
                                                >
                                                    <span className="font-bold text-md text-slate-900">나는 {partyNames.plaintiff}</span>
                                                    <span className={`block mt-1 text-sm ${mySide === 'plaintiff' ? 'text-blue-800' : 'text-slate-600'}`}>{partyNames.defendant}의 주장을 반박하겠습니다.</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMySide('defendant')}
                                                    className={`p-4 rounded-lg border-2 text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 ${ mySide === 'defendant' ? 'border-blue-500 bg-blue-50 focus:ring-blue-500' : 'border-slate-300 bg-white hover:border-slate-400 focus:ring-slate-400' }`}
                                                    aria-pressed={mySide === 'defendant'}
                                                >
                                                    <span className="font-bold text-md text-slate-900">나는 {partyNames.defendant}</span>
                                                    <span className={`block mt-1 text-sm ${mySide === 'defendant' ? 'text-blue-800' : 'text-slate-600'}`}>{partyNames.plaintiff}의 주장을 반박하겠습니다.</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div>
                                            <label htmlFor="my-args" className="block text-sm font-medium text-slate-700 mb-1">
                                                나의 주장 직접 입력 (선택사항)
                                            </label>
                                            <textarea
                                                id="my-args"
                                                rows={4}
                                                className="block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 bg-white text-slate-900"
                                                placeholder="요약된 주장 외에 추가하거나, 직접 정리하고 싶은 주장을 입력하세요."
                                                value={myArgs}
                                                onChange={(e) => setMyArgs(e.target.value)}
                                            />
                                             <p className="mt-2 text-xs text-slate-500">
                                                요약된 주장 외에 추가하거나, 직접 정리하고 싶은 주장을 입력하면 '내 주장 정리'에 반영됩니다.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleGenerate}
                                        disabled={isGenerateDisabled()}
                                        className="w-full inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors duration-200 mt-6"
                                    >
                                        {loading ? 'AI 분석 중...' : 'AI 종합 분석 생성'}
                                    </button>
                                    {error && <p className="text-sm text-red-600 mt-2 text-center">{error}</p>}

                                    {loading && <Spinner />}

                                    {!loading && hasResults && (
                                        <div className="mt-10 space-y-10">
                                            <hr className="border-slate-300" />
                                            <div className="flex justify-end items-center space-x-3">
                                                <button onClick={handleCopy} className="inline-flex items-center justify-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50">
                                                    <Icon icon="copy" className="w-5 h-5 mr-2 text-slate-500" />
                                                    <span>{copySuccess ? '복사됨!' : '전체 결과 복사'}</span>
                                                </button>
                                                <button onClick={handleDownload} className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700">
                                                    <Icon icon="download" className="w-5 h-5 mr-2" />
                                                    <span>전체 결과 다운로드</span>
                                                </button>
                                            </div>

                                            {summaryResult && (
                                                <section aria-labelledby="summary-result-title">
                                                    <h3 id="summary-result-title" className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-200">사건 요약</h3>
                                                    <div className="p-4 bg-white rounded-lg border border-slate-200 prose prose-sm max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: summaryResult.replace(/\n/g, '<br />') }} />
                                                </section>
                                            )}

                                            {comparisonResult.length > 0 && (
                                                <section aria-labelledby="comparison-result-title">
                                                    <h3 id="comparison-result-title" className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-200">쟁점별 비교</h3>
                                                    <div className="space-y-12 py-4">
                                                        {comparisonResult.map((row, index) => (
                                                            <div key={index} className="flex items-stretch justify-center gap-4 md:gap-8">
                                                                <div className="w-2/5 flex flex-col p-4 bg-white rounded-lg shadow-md border border-slate-200">
                                                                    <h4 className="font-bold text-lg text-slate-800 mb-3 text-center pb-2 border-b border-slate-200">{partyNames.plaintiff}</h4>
                                                                    <div className="flex-grow space-y-3">
                                                                        <div><p className="font-semibold text-slate-800">【주장】</p><p className="whitespace-pre-wrap text-sm text-slate-600">{row.plaintiff_argument}</p></div>
                                                                        <div><p className="font-semibold text-slate-800">【증거】</p><p className="whitespace-pre-wrap text-sm text-slate-600">{row.plaintiff_evidence}</p></div>
                                                                    </div>
                                                                </div>
                                                                <div className="w-1/5 flex items-center justify-center min-w-[120px]">
                                                                    <div className="text-center bg-slate-700 text-white font-bold p-3 rounded-lg shadow-lg w-full"><span className="block text-xs uppercase tracking-wider mb-1">쟁점</span>{row.issue}</div>
                                                                </div>
                                                                <div className="w-2/5 flex flex-col p-4 bg-white rounded-lg shadow-md border border-slate-200">
                                                                    <h4 className="font-bold text-lg text-slate-800 mb-3 text-center pb-2 border-b border-slate-200">{partyNames.defendant}</h4>
                                                                    <div className="flex-grow space-y-3">
                                                                        <div><p className="font-semibold text-slate-800">【주장】</p><p className="whitespace-pre-wrap text-sm text-slate-600">{row.defendant_argument}</p></div>
                                                                        <div><p className="font-semibold text-slate-800">【증거】</p><p className="whitespace-pre-wrap text-sm text-slate-600">{row.defendant_evidence}</p></div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </section>
                                            )}
                                            
                                            {counterResult && (
                                                <section aria-labelledby="counter-result-title">
                                                    <h3 id="counter-result-title" className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-200">반박 논거</h3>
                                                    <div className="p-4 bg-white rounded-lg border border-slate-200 prose prose-sm max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: counterResult.replace(/\n/g, '<br />') }} />
                                                </section>
                                            )}

                                            {structureResult && (
                                                <section aria-labelledby="structure-result-title">
                                                    <h3 id="structure-result-title" className="text-lg font-bold text-slate-800 mb-3 pb-2 border-b border-slate-200">내 주장 정리</h3>
                                                    <div className="p-4 bg-white rounded-lg border border-slate-200 prose prose-sm max-w-none prose-slate" dangerouslySetInnerHTML={{ __html: structureResult.replace(/\n/g, '<br />') }} />
                                                </section>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
                
                 <footer className="text-center mt-12 text-sm text-slate-500">
                    <p>본 AI 도우미가 제공하는 정보는 법률 자문이 아니며, 참고용으로만 활용해주시기 바랍니다.</p>
                    <p>&copy; {new Date().getFullYear()} AI Legal Assistant. All rights reserved.</p>
                </footer>
            </main>
        </div>
    );
};

export default App;
