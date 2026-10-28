# Requirements Document

## Introduction

Aura is a Progressive Web App (PWA) offline AI tutor targeting Malaysian students aged 10–16 (roughly Year 4 through Form 4). The app allows students to photograph or upload a math problem, have it recognised via OCR, receive step-by-step guidance, and practise through generated exercises — all without a persistent internet connection after the initial install. Content aligns with the Kurikulum Standard Sekolah Rendah (KSSR) and Kurikulum Standard Sekolah Menengah (KSSM), and the interface supports Bahasa Malaysia and English.

## Glossary

- **App**: The Aura PWA running in the student's browser.
- **Student**: A Malaysian student aged 10–16 using the App.
- **Problem_Image**: A photograph or uploaded image file containing a handwritten or printed math problem.
- **OCR_Engine**: The Roboflow EasyOCR serverless workflow that extracts text from a Problem_Image.
- **Problem_Text**: The math expression or word problem extracted from a Problem_Image by the OCR_Engine.
- **AI_Tutor**: The on-device or cached language model component that analyses Problem_Text and generates tutoring responses.
- **Step**: A single numbered line of working in a solution walkthrough produced by the AI_Tutor.
- **Hint**: A partial, non-revealing nudge produced by the AI_Tutor to guide the Student toward the next Step without giving the answer.
- **Exercise**: A generated practice problem similar in topic and difficulty to the current problem.
- **Answer**: The Student's submitted response to an Exercise.
- **Feedback**: The AI_Tutor's evaluation of an Answer, including whether it is correct and an explanation.
- **Topic**: A curriculum unit (e.g., "Fractions", "Linear Equations") drawn from KSSR or KSSM.
- **Curriculum_Level**: One of five levels — Year 4, Year 5, Year 6, Form 1, Form 2, Form 3, Form 4 — corresponding to ages 10–16.
- **Progress_Record**: A locally stored log of Topics attempted, Exercises completed, and accuracy rates for a Student session.
- **Service_Worker**: The PWA background script that caches assets and AI model files for offline use.
- **Cache**: The browser storage managed by the Service_Worker holding App assets, AI model weights, and curriculum content.
- **Language_Preference**: The Student's chosen interface language, either Bahasa Malaysia or English.
- **Pretty_Printer**: The component that formats AI_Tutor output (steps, hints, feedback) into readable, consistently styled text.

---

## Requirements

### Requirement 1: Offline Installation and Asset Caching

**User Story:** As a Student, I want the App to work without an internet connection after the first visit, so that I can study anywhere without relying on mobile data.

#### Acceptance Criteria

1. WHEN the Student visits the App for the first time with an internet connection, THE Service_Worker SHALL cache all static assets, AI model files, and curriculum content required for offline operation.
2. WHEN the Student opens the App without an internet connection, THE App SHALL load the lesson viewer, question display, and answer submission interface fully from the Cache within 3 seconds, without making any network requests.
3. WHEN an updated version of the App is available online, THE Service_Worker SHALL download the update in the background and display a non-blocking banner notifying the Student that a new version is ready, which the Student can dismiss or apply.
4. IF the Cache storage falls below 50 MB of available space, THEN THE App SHALL display a warning message indicating insufficient storage and prompt the Student to free up device storage before the warning can be dismissed.
5. THE Service_Worker SHALL apply a cache-first strategy to all assets cached during initial installation (static assets, AI model files, and curriculum content) and a network-first strategy to all OCR API requests, falling back to a cached response if the network is unavailable.
6. IF the Service_Worker fails to cache all required assets during the first visit due to a network interruption, THEN THE App SHALL display an error message indicating that offline setup is incomplete and prompt the Student to reload while connected to complete installation.

---

### Requirement 2: Problem Capture via Camera or File Upload

**User Story:** As a Student, I want to photograph or upload a picture of my math problem, so that I do not have to type out equations manually.

#### Acceptance Criteria

1. WHEN the Student selects the camera option on a mobile device, THE App SHALL invoke the device camera and allow the Student to capture a Problem_Image.
2. WHEN the Student selects the upload option, THE App SHALL open a file picker accepting JPEG, PNG, and HEIC image formats up to 10 MB.
3. IF the Student selects a file with an unsupported format, THEN THE App SHALL display an error message listing the accepted formats (JPEG, PNG, HEIC) and reject the file without submitting it to the OCR_Engine.
4. WHEN a Problem_Image is selected, THE App SHALL display a preview of the Problem_Image with Confirm and Retake actions before any submission to the OCR_Engine.
5. WHEN the Student confirms the Problem_Image, THE App SHALL submit it to the OCR_Engine.
6. WHEN the Problem_Image is submitted, THE App SHALL display a loading indicator within 500 ms and dismiss it when the OCR_Engine responds or returns an error.
7. IF the Problem_Image file size exceeds 10 MB, THEN THE App SHALL display an error message stating the file size limit and reject the upload without submitting to the OCR_Engine.
8. IF the device has no internet connection when the Student submits a Problem_Image, THEN THE App SHALL inform the Student that OCR requires a connection and suggest manual text entry as an alternative.
9. IF the camera is unavailable or the Student denies camera permission, THEN THE App SHALL display an informative message and present only the file upload option as an alternative.

---

### Requirement 3: OCR-Based Problem Text Extraction

**User Story:** As a Student, I want the App to read the math problem from my photo, so that I can get help without typing.

#### Acceptance Criteria

1. WHEN the OCR_Engine returns a successful response, THE App SHALL display the extracted Problem_Text for the Student to review and correct before tutoring begins.
2. WHEN the Student edits the displayed Problem_Text, THE App SHALL update the Problem_Text used for tutoring to reflect the Student's corrections.
3. WHEN the OCR_Engine returns a response, THE Pretty_Printer SHALL format the Problem_Text using standard mathematical notation: fractions as a/b, exponents as x^n, square roots as sqrt(x), and subscripts as x_n.
4. IF the OCR_Engine returns an error or a confidence score below 0.85, THEN THE App SHALL display an error message and allow the Student to re-capture or manually enter the Problem_Text.
5. IF the OCR_Engine does not respond within 15 seconds, THEN THE App SHALL cancel the request, display a timeout message, and allow the Student to retry.
6. IF the Student submits empty or whitespace-only Problem_Text, THEN THE App SHALL display an inline validation message and prevent the tutoring session from starting.
7. WHEN the Pretty_Printer formats the Problem_Text, THE App SHALL verify that the formatted text is accepted by the AI_Tutor before presenting it to the Student; IF validation fails, THE App SHALL display an error and prompt the Student to manually correct the Problem_Text.

---

### Requirement 4: Curriculum-Aligned Topic Detection

**User Story:** As a Student, I want the App to identify which math topic my problem belongs to, so that the guidance I receive is relevant to my school syllabus.

#### Acceptance Criteria

1. WHEN Problem_Text is confirmed, THE AI_Tutor SHALL classify the problem into exactly one Topic from the KSSR or KSSM syllabus and assign the corresponding Curriculum_Level.
2. WHEN the AI_Tutor classifies a Topic, THE App SHALL display the detected Topic name and Curriculum_Level to the Student within 5 seconds of classification completing.
3. IF the AI_Tutor cannot determine a Topic with sufficient confidence, THEN THE App SHALL prompt the Student to select a Topic manually from a dropdown of all available Topics before proceeding.
4. WHEN the Student selects "disagree" on the detected Topic, THE App SHALL display a dropdown containing all Topics available across the Student's enrolled Curriculum_Level, allowing the Student to select exactly one replacement Topic.
5. THE AI_Tutor SHALL support Topics across all seven Curriculum_Levels (Year 4 through Form 4), including at minimum: Whole Numbers, Fractions, Decimals, Percentages, Ratios, Geometry, Measurement, Algebra, Linear Equations, Quadratic Expressions, Statistics, and Probability.

---

### Requirement 5: Step-by-Step Solution Guidance

**User Story:** As a Student, I want the App to walk me through the solution step by step, so that I understand the method rather than just getting an answer.

#### Acceptance Criteria

1. WHEN the Student requests a solution, THE AI_Tutor SHALL generate a solution as a numbered sequence of Steps, each containing the working and a brief explanation of no more than 40 words.
2. WHEN the AI_Tutor generates Steps, THE App SHALL reveal one Step at a time, labelled "Step N of M", require the Student to tap "Next Step" to proceed, and replace "Next Step" with "See Summary" on the final Step.
3. WHEN the Student requests a Hint instead of the next Step, THE AI_Tutor SHALL generate a Hint that reveals partial reasoning without including the numeric result for that Step, and SHALL offer no more than 3 Hints per Step.
4. WHEN the AI_Tutor generates a solution, THE Pretty_Printer SHALL format all mathematical expressions in Steps and Hints using consistent notation aligned with the Malaysian school convention: "×" for multiplication, "÷" for division, "x^n" for exponentiation, and "a/b" for fractions.
5. WHEN the Student taps "See Summary", THE App SHALL display a summary statement confirming the final answer and the Topic method applied.
6. IF Problem_Text contains no valid mathematical expression, THEN THE AI_Tutor SHALL inform the Student that the problem could not be parsed and prompt re-entry.
7. IF the AI_Tutor fails to generate a Step due to a processing error, THEN THE App SHALL display an error message and allow the Student to retry from the current Step without losing prior Steps.

---

### Requirement 6: Practice Exercise Generation

**User Story:** As a Student, I want to practise similar problems after seeing a solution, so that I can reinforce what I have learned.

#### Acceptance Criteria

1. WHEN the Student completes a solution walkthrough, THE AI_Tutor SHALL display a prompt offering to generate up to five Exercises of the same Topic and Curriculum_Level, with Accept and Dismiss options.
2. WHEN the Student submits an Answer to an Exercise, THE AI_Tutor SHALL generate Feedback within 3 seconds, stating whether the Answer is correct and providing a one-sentence explanation.
3. WHEN the Student's Answer is incorrect, THE AI_Tutor SHALL offer exactly one Hint for that Exercise without immediately revealing the correct answer.
4. WHEN the Student requests the correct answer after two incorrect attempts on the same Exercise during the current Session, THE AI_Tutor SHALL reveal the answer and a full Step-by-step solution, and mark the Exercise as completed.
5. THE AI_Tutor SHALL generate Exercises that vary in numerical values and phrasing from the original problem, with no two generated Exercises being identical within the set.
6. IF the Student's Answer does not match the answer format declared by the Exercise, THEN THE App SHALL display an inline validation message and reject the submission without calling the AI_Tutor.

---

### Requirement 7: Progress Tracking

**User Story:** As a Student, I want to see a summary of the topics I have practised and how well I am doing, so that I can focus on areas where I need more work.

#### Acceptance Criteria

1. WHEN the Student completes an Exercise, THE App SHALL update the Progress_Record with the Topic, Curriculum_Level, and whether the Answer was correct on the first attempt.
2. WHEN the Student opens the progress view, THE App SHALL display a summary showing Topics attempted, total Exercises completed, and the first-attempt accuracy rate per Topic calculated as (first-attempt correct answers ÷ total exercises attempted per Topic) × 100, displayed as a percentage rounded to one decimal place.
3. THE App SHALL store all Progress_Records in browser local storage so that progress persists across sessions on the same device without requiring an account.
4. WHEN the Student requests to clear progress data, THE App SHALL display a confirmation dialog; WHEN the Student confirms, THE App SHALL delete the Progress_Record from local storage and reset all displayed statistics to zero.
5. IF local storage is unavailable, THEN THE App SHALL display an inline, non-blocking message stating "Progress cannot be saved on this device" and continue to allow tutoring and practice without persistence.
6. WHEN the number of stored Progress_Records reaches 10,000, THE App SHALL replace the oldest Progress_Record with the new entry to prevent unbounded storage growth.

---

### Requirement 8: Language Support (Bahasa Malaysia and English)

**User Story:** As a Student, I want to use the App in Bahasa Malaysia or English, so that I can learn in the language I am most comfortable with.

#### Acceptance Criteria

1. WHEN the App opens and no Language_Preference is found in browser local storage, THE App SHALL display a language selection prompt before any other content, requiring the Student to choose Bahasa Malaysia or English.
2. WHEN a Language_Preference is selected, THE App SHALL render all UI labels, instructions, AI_Tutor Steps, Hints, and Feedback in the chosen language.
3. WHEN the Student changes the Language_Preference in settings, THE App SHALL immediately re-render all visible UI labels, instructions, AI_Tutor Steps, Hints, and Feedback on the current screen without requiring a page reload.
4. THE App SHALL store the Language_Preference in browser local storage so that the preference persists across sessions.
5. IF the Student dismisses the language selection prompt without making a choice, THE App SHALL default to English and proceed.
6. IF a translation for a UI string is missing in the selected Language_Preference, THEN THE App SHALL fall back to English for that string and log the missing key to the browser console.

---

### Requirement 9: Accessible and Mobile-First UI

**User Story:** As a Student using a smartphone or tablet, I want the App to be easy to use on a small screen, so that I can study comfortably on my device.

#### Acceptance Criteria

1. THE App SHALL render all interactive elements with a minimum touch target size of 44 × 44 CSS pixels.
2. THE App SHALL use a single-column layout on screens narrower than 480 px and a two-column layout on screens 480 px and wider.
3. THE App SHALL provide sufficient colour contrast such that all text meets WCAG 2.1 AA contrast ratio requirements (minimum 4.5:1 for normal text, 3:1 for large text).
4. WHEN the Student uses a screen reader, THE App SHALL expose all interactive elements with ARIA labels that are non-empty, unique within the current view, and communicate the element's purpose without relying on visual position or icon shape, in the selected Language_Preference.
5. WHEN the device orientation changes, THE App SHALL reflow the layout within 300 ms without loss of the active question index, in-progress text input, or vertical scroll position.
6. THE App SHALL render body text at a minimum of 16 CSS px and supplementary text at a minimum of 12 CSS px.
7. THE App SHALL support full keyboard navigation, with a visible focus indicator on the focused element and a logical tab order that follows the visual reading order of the page.
