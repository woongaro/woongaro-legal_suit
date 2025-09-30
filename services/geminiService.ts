import { GoogleGenAI, Type } from "@google/genai";
import type { ComparisonRow } from '../types';

// Helper to convert File/Blob to Base64
const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            if (typeof reader.result === 'string') {
                // result is "data:mime/type;base64,..." -> we only want the part after the comma
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to read file as Base64 string.'));
            }
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
};

// Helper to extract text from a PDF file
const getTextFromPdf = async (file: File): Promise<string> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await (window as any).pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }
    return fullText;
};


export async function evaluateEvidence(argument: string, evidenceFile: File): Promise<string> {
    if (!argument || !evidenceFile) {
        throw new Error("평가를 위해 주장과 증거를 모두 제공해야 합니다.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
        당신은 예리한 법률 분석가입니다. 아래에 제시된 '주장'과 '증거 자료'를 면밀히 검토해주세요.

        # 주장
        ${argument}

        # 증거 자료 설명
        (아래에 첨부된 이미지 또는 PDF 텍스트)

        ---

        다음 항목에 따라 '증거 자료'가 '주장'을 얼마나 잘 뒷받침하는지 분석하고 평가해주세요.

        1.  **관련성:** 증거가 주장의 핵심 내용과 직접적으로 관련이 있습니까?
        2.  **신빙성 및 강도:** 이 증거는 주장을 입증하기에 얼마나 강력하고 신뢰할 만합니까? 증거의 명확성을 평가해주세요.
        3.  **잠재적 약점 또는 반론:** 이 증거에 대해 상대방이 제기할 수 있는 반론이나 증거의 약점은 무엇입니까?
        4.  **종합 평가:** 전반적으로 이 증거가 주장을 뒷받침하는 데 얼마나 효과적인지 종합적으로 평가해주세요.

        결과는 Markdown 형식을 사용하여 가독성 좋게 구성해주세요.
    `;
    
    let contents;

    try {
        if (evidenceFile.type.startsWith('image/')) {
            const base64Data = await fileToBase64(evidenceFile);
            contents = { parts: [
                { text: prompt },
                { inlineData: { mimeType: evidenceFile.type, data: base64Data } }
            ]};
        } else if (evidenceFile.type === 'application/pdf') {
            const pdfText = await getTextFromPdf(evidenceFile);
            contents = { parts: [
                { text: prompt },
                { text: `\n\n--- PDF 증거 내용 ---\n${pdfText}` }
            ]};
        } else {
            throw new Error("지원되지 않는 증거 파일 형식입니다. 이미지 또는 PDF 파일을 업로드해주세요.");
        }

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
        });
        return response.text;
    } catch (error) {
        console.error("Gemini API Error (Evaluate Evidence):", error);
        throw new Error("증거 평가 중 오류가 발생했습니다.");
    }
}

export async function summarizeDocument(argument: string, evidenceFile: File | null): Promise<string> {
    if (!argument && !evidenceFile) {
        throw new Error("요약할 주장이나 증거가 없습니다.");
    }
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let prompt = `다음 법률 '주장'과 '증거 자료'를 검토하고, 이 둘을 종합하여 사건의 핵심 내용을 요약해주세요. 주장을 명확히 설명하고, 증거가 그 주장을 어떻게 뒷받침하는지 포함하여 서술해주세요. 일반인도 이해하기 쉽게 간결하게 작성해주세요.\n\n---\n\n# 주장\n${argument || '입력된 주장이 없습니다.'}\n\n`;
    let contents;

    try {
        if (!evidenceFile) {
            // Only argument is provided
            contents = prompt;
        } else if (evidenceFile.type.startsWith('image/')) {
            const base64Data = await fileToBase64(evidenceFile);
            contents = { parts: [
                { text: prompt },
                { text: "# 증거 자료\n(아래 이미지 참고)\n\n" },
                { inlineData: { mimeType: evidenceFile.type, data: base64Data } }
            ]};
        } else if (evidenceFile.type === 'application/pdf') {
            const pdfText = await getTextFromPdf(evidenceFile);
            contents = prompt + `# 증거 자료 (PDF 내용)\n${pdfText}`;
        } else {
            throw new Error("지원되지 않는 증거 파일 형식입니다. 이미지 또는 PDF 파일을 업로드해주세요.");
        }

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
        });
        return response.text;
    } catch (error) {
        console.error("Gemini API Error (Summarize Document):", error);
        throw new Error("자료 요약 중 오류가 발생했습니다.");
    }
}


export async function generateSummary(plaintiffArgs: string, defendantArgs: string): Promise<string> {
  if (!plaintiffArgs || !defendantArgs) {
    throw new Error("원고와 피고의 주장을 모두 요약해야 합니다.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    다음은 법적 사건에 대한 원고와 피고의 주장 및 증거 요약입니다.

    # 원고 측 주장 및 증거 요약
    ${plaintiffArgs}

    # 피고 측 주장 및 증거 요약
    ${defendantArgs}

    ---

    위 내용을 바탕으로 다음 항목들을 법률 전문가가 아닌 일반인도 이해하기 쉽게 평이한 언어로 요약하고 설명해주세요.

    1.  **각 당사자의 핵심 입장:** 원고와 피고가 각각 무엇을 주장하고 있는지 명확히 요약해주세요.
    2.  **핵심 증거:** 각 당사자가 제시한 가장 중요한 증거는 무엇인지 설명해주세요.
    3.  **주요 법적/사실적 쟁점:** 이 사건에서 가장 핵심적으로 다투어지는 쟁점들이 무엇인지 정리해주세요.

    결과는 Markdown 형식을 사용하여 가독성 좋게 구성해주세요.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error (Summary):", error);
    throw new Error("사건 요약 생성 중 오류가 발생했습니다.");
  }
}

export async function generateComparisonTable(plaintiffArgs: string, defendantArgs: string, keyIssues: string): Promise<ComparisonRow[]> {
  if (!plaintiffArgs || !defendantArgs || !keyIssues) {
    throw new Error("원고와 피고의 주장 요약, 그리고 주요 쟁점을 모두 입력해야 합니다.");
  }
  
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    다음은 법적 사건에 대한 원고와 피고의 주장 요약, 그리고 주요 쟁점입니다.

    # 주요 쟁점
    ${keyIssues}

    # 원고 측 주장 및 증거 요약
    ${plaintiffArgs}

    # 피고 측 주장 및 증거 요약
    ${defendantArgs}

    ---

    위 정보를 바탕으로, 각 '주요 쟁점'에 대해 원고와 피고의 주장, 증거, 논리를 비교하는 표를 생성해주세요. 결과는 반드시 지정된 JSON 형식으로 반환해야 합니다. 각 주장에 대한 핵심 증거를 명확히 포함해주세요.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              issue: { type: Type.STRING, description: "핵심 쟁점" },
              plaintiff_argument: { type: Type.STRING, description: "쟁점에 대한 원고의 핵심 주장" },
              plaintiff_evidence: { type: Type.STRING, description: "원고 주장을 뒷받침하는 핵심 증거" },
              defendant_argument: { type: Type.STRING, description: "쟁점에 대한 피고의 핵심 주장" },
              defendant_evidence: { type: Type.STRING, description: "피고 주장을 뒷받침하는 핵심 증거" },
            },
            required: ["issue", "plaintiff_argument", "plaintiff_evidence", "defendant_argument", "defendant_evidence"],
          },
        },
      },
    });
    
    const jsonResponse = JSON.parse(response.text);
    return jsonResponse as ComparisonRow[];

  } catch (error) {
    console.error("Gemini API Error (Comparison):", error);
    throw new Error("쟁점별 비교표 생성 중 오류가 발생했습니다.");
  }
}


export async function generateCounterArguments(opponentArgs: string, mySideName: string, opponentSideName: string): Promise<string> {
    if (!opponentArgs) {
        throw new Error("상대방의 주장이 요약되지 않았습니다.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `
        당신은 유능한 변호사입니다. 현재 저는 '${mySideName}'측 입장에서 소송을 진행하고 있습니다.
        
        아래는 상대방(${opponentSideName})의 주장과 증거 요약입니다.
        
        # 상대방 주장 및 증거 요약
        ${opponentArgs}
        
        ---
        
        위 내용을 면밀히 분석하여, 우리 측(${mySideName})에서 제기할 수 있는 효과적인 반박 논거와 대응 전략을 구체적으로 추천해주세요. 다음 항목을 포함하여 답변해주세요.
        
        1.  **상대방 주장의 논리적 허점 또는 약점:** 상대방 주장의 모순점이나 근거가 부족한 부분을 지적해주세요.
        2.  **제출된 증거에 대한 반박:** 상대방 증거의 신빙성을 문제 삼거나, 우리에게 유리하게 해석할 수 있는 방법을 제시해주세요.
        3.  **추가로 수집하면 좋을 증거:** 우리의 반박을 뒷받침하기 위해 어떤 증거를 더 확보하면 좋을지 아이디어를 제공해주세요.
        4.  **전체적인 대응 전략:** 어떤 방향으로 대응하는 것이 가장 효과적일지 전략을 제안해주세요.

        결과는 Markdown 형식을 사용하여 가독성 좋게 구성해주세요.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Gemini API Error (Counter Arguments):", error);
        throw new Error("반박 논거 생성 중 오류가 발생했습니다.");
    }
}


export async function structureMyArguments(myArgs: string, keyIssues: string): Promise<string> {
    if (!myArgs || !keyIssues) {
        throw new Error("나의 주장이 요약되지 않았거나 주요 쟁점이 입력되지 않았습니다.");
    }
    
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `
        다음은 제가 법적 사건에 대해 펼치고 싶은 주장들의 요약과 이 사건의 주요 쟁점입니다.

        # 나의 주장 (요약)
        ${myArgs}

        # 주요 쟁점
        ${keyIssues}

        ---

        위 '나의 주장'들을 '주요 쟁점'에 따라 체계적으로 분류하고 논리적인 순서로 재구성해주세요. 각 쟁점별로 관련된 주장을 그룹화하고, 설득력 있는 구조로 정리하여 변론서나 준비서면에 바로 활용할 수 있는 형태로 만들어주세요.

        결과는 Markdown 형식을 사용하여 가독성 좋게 구성해주세요.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            // Fix: The `contents` property was being passed as a shorthand property without a declared variable. It should be assigned the `prompt` variable.
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Gemini API Error (Structure Arguments):", error);
        throw new Error("주장 정리 중 오류가 발생했습니다.");
    }
}