
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SummaryResult, ProcessingStatus } from './types';
import { generateSummaryFromText } from './services/geminiService';
import { generateSummaryFromVolcano } from './services/volcanoService';
import { FolderIcon, FileIcon, CheckCircleIcon, ExclamationCircleIcon, SparklesIcon, LoadingSpinner } from './components/icons';

// PDF.js and JSZip are loaded from CDN, so we need to declare them to TypeScript
declare const pdfjsLib: any;
declare const JSZip: any;

// Allow non-standard 'webkitdirectory' attribute on inputs
declare module 'react' {
    interface InputHTMLAttributes<T> {
      webkitdirectory?: string;
    }
}

type ApiProvider = 'gemini' | 'volcano';

const App: React.FC = () => {
    const [files, setFiles] = useState<File[]>([]);
    const [prompt, setPrompt] = useState<string>("Summarize this document in three key bullet points.");
    const [apiProvider, setApiProvider] = useState<ApiProvider>('gemini');
    const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
    const [volcanoCreds, setVolcanoCreds] = useState({ apiKey: '' });
    const [results, setResults] = useState<SummaryResult[]>([]);
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [globalError, setGlobalError] = useState<string>('');
    const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);
    
    const availableModels = ['gemini-2.5-flash'];

    useEffect(() => {
        if (!process.env.API_KEY) {
            setApiKeyMissing(true);
        }
    }, []);

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = event.target.files;
        if (selectedFiles) {
            const allFiles = Array.from(selectedFiles);
            const pdfFiles = allFiles.filter((file: File) => file.type === 'application/pdf');
            if(pdfFiles.length !== allFiles.length) {
                setGlobalError("Some selected files were not PDFs and have been ignored.");
            } else {
                setGlobalError("");
            }
            setFiles(pdfFiles);
            setResults([]); // Reset results when new files are selected
        }
    };
    
    const parsePdf = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return fullText;
    };

    const constructFullPrompt = (pdfText: string, userPrompt: string): string => {
        return `
          Based on the following user request, please analyze the provided PDF content and generate a response.
    
          USER REQUEST:
          "${userPrompt}"
    
          The final output should be in plain TEXT format.
    
          --- PDF CONTENT START ---
          ${pdfText}
          --- PDF CONTENT END ---
        `;
    };

    const handleGenerate = useCallback(async () => {
        if (files.length === 0 || !prompt.trim()) {
            setGlobalError("Please select a folder with PDFs and enter a prompt.");
            return;
        }

        setIsProcessing(true);
        setGlobalError('');
        const initialResults: SummaryResult[] = files.map(file => ({
            id: `${file.name}-${file.lastModified}`,
            fileName: file.name,
            content: '',
            status: ProcessingStatus.PROCESSING,
        }));
        setResults(initialResults);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const pdfText = await parsePdf(file);
                if (!pdfText.trim()) {
                   throw new Error("Could not extract any text from the PDF. It might be an image-only PDF.");
                }

                const fullPrompt = constructFullPrompt(pdfText, prompt);
                let summary = '';

                if (apiProvider === 'gemini') {
                    summary = await generateSummaryFromText(fullPrompt, selectedModel);
                } else {
                    summary = await generateSummaryFromVolcano(fullPrompt, volcanoCreds);
                }
                
                if (summary.startsWith("Error")) {
                    throw new Error(summary);
                }
                
                setResults(prev => prev.map((res, index) => 
                    index === i ? { ...res, status: ProcessingStatus.SUCCESS, content: summary } : res
                ));
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
                console.error(`Failed to process ${file.name}:`, error);
                setResults(prev => prev.map((res, index) => 
                    index === i ? { ...res, status: ProcessingStatus.ERROR, error: errorMessage } : res
                ));
            }
        }

        setIsProcessing(false);
    }, [files, prompt, selectedModel, apiProvider, volcanoCreds]);

    const handleDownloadZip = useCallback(() => {
        const zip = new JSZip();
        const successfulResults = results.filter(r => r.status === ProcessingStatus.SUCCESS);

        if (successfulResults.length === 0) {
            setGlobalError("No successful summaries to download.");
            return;
        }

        successfulResults.forEach(result => {
            const fileName = result.fileName.replace('.pdf', '.txt');
            zip.file(fileName, result.content);
        });

        zip.generateAsync({ type: 'blob' }).then((content: any) => {
            const link = document.createElement('a');
            link.href = URL.createObjectURL(content);
            link.download = 'pdf_summaries.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    }, [results]);

    const isReadyToGenerate = useMemo(() => {
        if (!files.length || !prompt.trim()) return false;
        if (apiProvider === 'gemini') return !apiKeyMissing;
        if (apiProvider === 'volcano') return !!volcanoCreds.apiKey;
        return false;
    }, [files, prompt, apiProvider, apiKeyMissing, volcanoCreds]);

    const allDone = useMemo(() => results.length > 0 && !isProcessing, [results, isProcessing]);

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 font-sans">
            <main className="max-w-4xl mx-auto p-4 md:p-8">
                <header className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400">
                        PDF Batch Summarizer
                    </h1>
                    <p className="mt-2 text-lg text-gray-400">Analyze an entire folder of PDFs with a single prompt.</p>
                </header>

                {apiKeyMissing && apiProvider === 'gemini' && (
                    <div className="bg-red-900/50 border border-red-600 text-red-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
                         <strong className="font-bold">API Key Missing!</strong>
                         <span className="block sm:inline ml-2">The Gemini API key is not configured. This application will not work.</span>
                    </div>
                )}
                
                {globalError && (
                    <div className="bg-yellow-900/50 border border-yellow-600 text-yellow-300 px-4 py-3 rounded-lg relative mb-6" role="alert">
                         <strong className="font-bold">Notice:</strong>
                         <span className="block sm:inline ml-2">{globalError}</span>
                    </div>
                )}

                <div className="space-y-8">
                    {/* Step 1: File Selection */}
                    <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
                        <h2 className="text-xl font-semibold mb-4 text-cyan-300">Step 1: Select PDF Files</h2>
                        <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-5 rounded-lg inline-flex items-center transition-colors duration-200">
                           <FolderIcon className="w-5 h-5 mr-2" />
                           <span>{files.length > 0 ? `${files.length} PDF(s) Selected` : 'Select a Folder of PDFs'}</span>
                        </label>
                        <input id="file-upload" type="file" className="hidden" multiple accept="application/pdf" onChange={handleFileSelect} webkitdirectory="true" />
                        <p className="text-sm text-gray-400 mt-3">Your browser will ask for permission to read the contents of a folder. Only PDF files will be processed.</p>
                    </div>

                    {/* Step 2: Configure Generation */}
                    <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
                        <h2 className="text-xl font-semibold mb-4 text-cyan-300">Step 2: Configure Generation</h2>
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Select AI Provider</label>
                                <div className="flex space-x-4">
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input type="radio" name="apiProvider" value="gemini" checked={apiProvider === 'gemini'} onChange={() => setApiProvider('gemini')} className="form-radio h-4 w-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500" />
                                        <span>Google Gemini</span>
                                    </label>
                                    <label className="flex items-center space-x-2 cursor-pointer">
                                        <input type="radio" name="apiProvider" value="volcano" checked={apiProvider === 'volcano'} onChange={() => setApiProvider('volcano')} className="form-radio h-4 w-4 text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500" />
                                        <span>Volcano Engine</span>
                                    </label>
                                </div>
                            </div>
                            
                            {apiProvider === 'volcano' && (
                                <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                    <h3 className="text-md font-semibold text-gray-300">Volcano Engine Credentials</h3>
                                    <div>
                                        <label htmlFor="volcano-key" className="block text-xs font-medium text-gray-400 mb-1">API Key</label>
                                        <input id="volcano-key" type="password" value={volcanoCreds.apiKey} onChange={e => setVolcanoCreds({ apiKey: e.target.value })} className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition" />
                                    </div>
                                     <p className="text-xs text-gray-500 mt-2">Your API key is used only for this session and is not stored anywhere.</p>
                                </div>
                            )}

                            <div>
                                <label htmlFor="prompt-textarea" className="block text-sm font-medium text-gray-300 mb-2">Define Your Prompt</label>
                                <textarea
                                    id="prompt-textarea"
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    className="w-full h-24 p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                                    placeholder="e.g., Extract the key financial metrics from this report."
                                />
                            </div>
                            
                            {apiProvider === 'gemini' && (
                                <div>
                                    <label htmlFor="model-select" className="block text-sm font-medium text-gray-300 mb-2">Select Model</label>
                                    <select
                                        id="model-select"
                                        value={selectedModel}
                                        onChange={(e) => setSelectedModel(e.target.value)}
                                        className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition"
                                    >
                                        {availableModels.map(model => (
                                            <option key={model} value={model}>{model}</option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-500 mt-2">
                                        Currently, `gemini-2.5-flash` is recommended for its balance of speed and quality.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Step 3: Generate */}
                    <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
                       <h2 className="text-xl font-semibold mb-6 text-cyan-300">Step 3: Generate Summaries</h2>
                        <button
                            onClick={handleGenerate}
                            disabled={!isReadyToGenerate || isProcessing}
                            className="w-full flex items-center justify-center text-lg font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-purple-500 to-cyan-500 hover:from-purple-600 hover:to-cyan-600 disabled:from-gray-600 disabled:to-gray-600 text-white shadow-lg disabled:shadow-none"
                        >
                            {isProcessing ? (
                                <>
                                    <LoadingSpinner className="w-5 h-5 mr-3"/>
                                    Processing...
                                </>
                            ) : (
                                <>
                                   <SparklesIcon className="w-6 h-6 mr-2" />
                                   Generate Summaries
                                </>
                            )}
                        </button>
                    </div>

                    {/* Results Section */}
                    {results.length > 0 && (
                        <div className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-semibold text-cyan-300">Results</h2>
                                {allDone && <button onClick={handleDownloadZip} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Download All (.zip)</button>}
                            </div>

                            <ul className="space-y-3">
                                {results.map(result => (
                                    <li key={result.id} className="bg-gray-900 p-4 rounded-lg border border-gray-700">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center">
                                                <FileIcon className="w-5 h-5 mr-3 text-gray-400" />
                                                <span className="font-medium text-gray-200">{result.fileName}</span>
                                            </div>
                                            
                                            {result.status === ProcessingStatus.PROCESSING && <LoadingSpinner className="w-5 h-5 text-purple-400"/>}
                                            {result.status === ProcessingStatus.SUCCESS && <CheckCircleIcon className="w-6 h-6 text-green-400"/>}
                                            {result.status === ProcessingStatus.ERROR && <ExclamationCircleIcon className="w-6 h-6 text-red-400"/>}
                                        </div>
                                        {result.status === ProcessingStatus.ERROR && (
                                            <p className="text-sm text-red-400 mt-2 pl-8">{result.error}</p>
                                        )}
                                        {result.status === ProcessingStatus.SUCCESS && (
                                            <div className="mt-3 pl-8 text-sm text-gray-400 max-h-24 overflow-y-auto border-l-2 border-gray-700 pl-4">
                                                <pre className="whitespace-pre-wrap font-sans">{result.content}</pre>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default App;
