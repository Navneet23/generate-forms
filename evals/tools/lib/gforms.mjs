// Stages 3-4: create the Google Form via the Forms API and publish it so
// anyone with the link can respond (required for the app's scraper).
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { CREDENTIALS_DIR } from "./env.mjs";

const TOKEN_PATH = path.join(CREDENTIALS_DIR, "token.json");
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, "client_secret.json");

function getAuth() {
  if (!fs.existsSync(TOKEN_PATH)) {
    throw new Error(`No OAuth token at ${TOKEN_PATH} — run "npm run auth" first`);
  }
  const secret = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf8"));
  const conf = secret.installed ?? secret.web;
  const oauth2 = new google.auth.OAuth2(conf.client_id, conf.client_secret);
  oauth2.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8")));
  return oauth2;
}

function toCreateItemRequest(q, index) {
  let question;
  switch (q.type) {
    case "short_answer":
      question = { textQuestion: { paragraph: false } };
      break;
    case "paragraph":
      question = { textQuestion: { paragraph: true } };
      break;
    case "multiple_choice":
      question = { choiceQuestion: { type: "RADIO", options: q.options.map((v) => ({ value: v })) } };
      break;
    case "checkboxes":
      question = { choiceQuestion: { type: "CHECKBOX", options: q.options.map((v) => ({ value: v })) } };
      break;
    case "dropdown":
      question = { choiceQuestion: { type: "DROP_DOWN", options: q.options.map((v) => ({ value: v })) } };
      break;
    case "linear_scale":
      question = {
        scaleQuestion: {
          low: q.low,
          high: q.high,
          ...(q.lowLabel ? { lowLabel: q.lowLabel } : {}),
          ...(q.highLabel ? { highLabel: q.highLabel } : {}),
        },
      };
      break;
    case "date":
      question = { dateQuestion: {} };
      break;
    case "time":
      question = { timeQuestion: {} };
      break;
    default:
      throw new Error(`unsupported type ${q.type}`);
  }
  return {
    createItem: {
      item: { title: q.text, questionItem: { question: { required: !!q.required, ...question } } },
      location: { index },
    },
  };
}

/** Creates + publishes the form. Returns { formId, editUrl, responderUrl, questionCount }. */
export async function createGoogleForm(structure) {
  const forms = google.forms({ version: "v1", auth: getAuth() });

  const created = await forms.forms.create({
    requestBody: { info: { title: structure.title, documentTitle: `[eval] ${structure.title}` } },
  });
  const formId = created.data.formId;

  const requests = [];
  if (structure.description) {
    requests.push({
      updateFormInfo: { info: { description: structure.description }, updateMask: "description" },
    });
  }
  structure.questions.forEach((q, i) => requests.push(toCreateItemRequest(q, i)));
  await forms.forms.batchUpdate({ formId, requestBody: { requests } });

  // Publish so anyone with the link can respond (new API forms start unpublished).
  await forms.forms.setPublishSettings({
    formId,
    requestBody: {
      publishSettings: { publishState: { isPublished: true, isAcceptingResponses: true } },
    },
  });

  const final = await forms.forms.get({ formId });
  return {
    formId,
    editUrl: `https://docs.google.com/forms/d/${formId}/edit`,
    responderUrl: final.data.responderUri,
    questionCount: structure.questions.length,
  };
}
