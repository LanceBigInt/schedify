import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocumentProxy, PDFPageProxy, TextContent } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs`;

// Interfaces
export interface Schedule {
    day: string;
    schedule: string;
    room: string;
}

interface CourseEntry {
    code: string;
    name: string;
    section: string;
    units: string;
    schedules: Schedule[];
}

interface ParsedSchedule {
    courses: CourseEntry[];
}



interface PDFPage extends PDFPageProxy {
    getTextContent(): Promise<TextContent>;
}

interface PDFDocument extends PDFDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFPage>;
}

const normalizeText = (text: string): string => {
    console.log("=== Starting Text Normalization ===");
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ' ')
        .trim();
};

// Export the main function that will process the PDF
export const processPDF = async (file: File): Promise<ParsedSchedule> => {
    if (!file || file.type !== 'application/pdf') {
        throw new Error('Please provide a valid PDF file.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const typedArray = new Uint8Array(arrayBuffer);

    try {
        const pdf: PDFDocument = await pdfjsLib.getDocument(typedArray).promise;
        const page = await pdf.getPage(1);
        const content = await page.getTextContent();
        const text = content.items.map((item) => 'str' in item ? item.str : '').join(' ');
        const normalizedText = normalizeText(text);
        return parseSchedule(normalizedText);
    } catch (error) {
        console.error('Error processing PDF:', error);
        throw error;
    }
};

const parseSchedule = (pageText: string): ParsedSchedule => {
    console.log("=== Processing Schedule ===");

    const contentStart: number = pageText.indexOf("UNITS") + 5;
    const contentEnd: number = pageText.indexOf("TOTAL UNITS");
    const relevantText: string = pageText.substring(contentStart, contentEnd).trim();

    const subjectPattern = /([A-Z]+\d*[A-Z]*)\s+([A-Z\s.'&]+)\s+([A-Z0-9]+)\s+((?:[MTWTHFS]+a?\s+[\d:APM\s-]+(?:ROOM|Room|VR)\s*[^\s]+\s*)+)([\d.]+)/g;
    const schedulePattern = /([MTWTHFS]+a?)\s+([\d:APM\s-]+)\s+(?:ROOM|Room|VR)\s*([^\s]+)/g;

    const regex = /\d+\.0/g;
    const combinedLines: string[] = [];
    let previousIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(relevantText)) !== null) {
        const beforeMatch = relevantText.substring(previousIndex, match.index + match[0].length);
        combinedLines.push(beforeMatch.trim());
        previousIndex = regex.lastIndex;
    }

    const remainingText = relevantText.substring(previousIndex).trim();
    if (remainingText) {
        combinedLines.push(remainingText);
    }

    const scheduleArray: CourseEntry[] = [];
    const processedCourses = new Map<string, CourseEntry>();

    combinedLines.forEach((line) => {
        if (line.trim() === "") return;

        let courseMatch: RegExpExecArray | null;
        while ((courseMatch = subjectPattern.exec(line)) !== null) {
            const [, code, name, section, scheduleBlock, units] = courseMatch;
            
            const courseKey = `${code.trim()}-${section.trim()}`;
            const schedules: Schedule[] = [];

            let scheduleMatch: RegExpExecArray | null;
            while ((scheduleMatch = schedulePattern.exec(scheduleBlock)) !== null) {
                const [, day, time, room] = scheduleMatch;
                
                schedules.push({
                    day: day.trim(),
                    schedule: time.trim(),
                    room: room.includes('VR') ? `${room.trim()}` : `Room ${room.trim()}`
                });
            }

            if (processedCourses.has(courseKey)) {
                const existingCourse = processedCourses.get(courseKey);
                if (existingCourse) {
                    existingCourse.schedules.push(...schedules);
                }
            } else {
                const courseEntry: CourseEntry = {
                    code: code.trim(),
                    name: name.trim(),
                    section: section.trim(),
                    units: units,
                    schedules: schedules
                };
                processedCourses.set(courseKey, courseEntry);
                scheduleArray.push(courseEntry);
            }
        }
    });

    return { courses: scheduleArray };
};
