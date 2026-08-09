# Context

Ubiquitous language for this repo. Glossary only — no implementation detail.

## Ask

One complete round trip between an assistant and a person. An Ask begins when the
assistant presents a Form and ends in exactly one Outcome. An Ask is never partially
complete: it is open, or it has an Outcome.

## Form

The ordered set of Questions presented in a single Ask. A Form has a title.

## Question

One item in a Form. A Question carries the text put to the person, and zero or more
Choices. A Question with zero Choices is answered entirely through its Other.

Every Question in a Form must be answered before the Form can be Submitted.

## Choice

One pre-written option belonging to a Question. A Choice has a label and may carry a
description that expands on the label. Choices are authored by the assistant; the person
selects among them.

A Question is either **single-select** (at most one Choice) or **multi-select** (any
number of Choices).

## Other

The free-text portion of a Question, always available alongside its Choices unless the
Question opts out. Other exists so a person is never forced to pick a Choice that
misrepresents them.

Other is not a Choice — it is a second, parallel way to answer the same Question. A
person may answer with Choices, with Other, or with both.

## Answer

What one person supplies for one Question: the Choices they selected, the Other text
they wrote, or both. An Answer is present when at least one of the two is non-empty.

## Outcome

How an Ask ended. Exactly one of:

- **Submitted** — the person answered every Question and confirmed. The assistant
  receives the Answers.
- **Cancelled** — the person explicitly declined to answer. The assistant receives no
  Answers and is told the person chose not to answer.
- **Abandoned** — the person left without deciding. Indistinguishable from Cancelled in
  intent, distinguished in reporting so the assistant knows no explicit refusal occurred.

Partial Answers are never returned under any Outcome.
