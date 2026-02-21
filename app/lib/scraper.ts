export interface FormQuestion {
  id: string;
  entryId: string;
  text: string;
  type:
    | "short_answer"
    | "paragraph"
    | "multiple_choice"
    | "checkboxes"
    | "dropdown"
    | "linear_scale"
    | "date"
    | "time"
    | "unknown";
  required: boolean;
  options: string[];
  scaleMin?: number;
  scaleMax?: number;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

export interface FormStructure {
  formId: string;
  title: string;
  description: string;
  questions: FormQuestion[];
}

const TYPE_MAP: Record<number, FormQuestion["type"]> = {
  0: "short_answer",
  1: "paragraph",
  2: "multiple_choice",
  3: "checkboxes",
  4: "dropdown",
  5: "linear_scale",
  9: "date",
  10: "time",
};

export async function scrapeForm(url: string): Promise<FormStructure> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FormRestyler/1.0)" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch form: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  // Locate FB_PUBLIC_LOAD_DATA_ in the page
  const marker = "FB_PUBLIC_LOAD_DATA_ = ";
  const markerIndex = html.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(
      "Could not find form data. Make sure the form is public and the URL is a valid Google Form."
    );
  }

  // Walk the string tracking bracket depth to find the full JSON array,
  // avoiding the non-greedy regex bug that stops at the first closing bracket.
  const jsonStart = markerIndex + marker.length;
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === "[") depth++;
    else if (html[i] === "]") {
      depth--;
      if (depth === 0) {
        jsonEnd = i + 1;
        break;
      }
    }
  }
  if (jsonEnd === -1) throw new Error("Failed to extract form data.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  try {
    raw = JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    throw new Error("Failed to parse form data.");
  }

  return normalise(url, raw);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalise(url: string, raw: any): FormStructure {
  const formIdMatch = url.match(/\/forms\/d\/e\/([^/]+)\//);
  const formId = formIdMatch?.[1] ?? "";

  const meta = raw?.[1];
  const title: string = meta?.[8] ?? "Untitled Form";
  const description: string = meta?.[0] ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawQuestions: any[] = meta?.[1] ?? [];

  const questions: FormQuestion[] = [];

  for (const q of rawQuestions) {
    const text: string = q?.[1] ?? "";
    const typeCode: number = q?.[3] ?? -1;
    const type = TYPE_MAP[typeCode] ?? "unknown";

    if (type === "unknown") continue; // skip unsupported types

    const questionId: string = String(q?.[0] ?? Math.random());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const answerDef: any[] = q?.[4]?.[0] ?? [];
    const entryId: string = `entry.${answerDef?.[0] ?? ""}`;
    const required: boolean = q?.[4]?.[0]?.[2] === 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawOptions: any[] = answerDef?.[1] ?? [];
    const options: string[] = rawOptions.map((o: any) => o?.[0] ?? "");

    const question: FormQuestion = {
      id: questionId,
      entryId,
      text,
      type,
      required,
      options,
    };

    if (type === "linear_scale") {
      question.scaleMin = answerDef?.[3]?.[0] ?? 1;
      question.scaleMax = answerDef?.[3]?.[1] ?? 5;
      question.scaleMinLabel = answerDef?.[4]?.[0] ?? "";
      question.scaleMaxLabel = answerDef?.[4]?.[1] ?? "";
    }

    questions.push(question);
  }

  return { formId, title, description, questions };
}
