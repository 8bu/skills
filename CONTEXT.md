# Context

The words this repository uses, and their meanings. This document gives the meanings only.
It does not describe the code.

## Ask

One complete exchange between an assistant and a person. An Ask starts when the assistant
shows a Form. It ends in one Outcome. An Ask is never partly complete. It is open, or it has
an Outcome.

## Form

The ordered set of Questions in one Ask. A Form has a title.

## Question

One item in a Form. A Question holds the text for the person. It also holds zero or more
Choices. The person answers a Question that has zero Choices through its Other.

The person must answer each Question in a Form before they can submit it.

## Choice

One option that belongs to a Question. A Choice has a label. It can also have a description
that gives more information about the label. The assistant writes the Choices. The person
selects from them.

A Question is **single-select** or **multi-select**. In a single-select Question, the person
selects one Choice at most. In a multi-select Question, the person selects any number of
Choices.

## Other

The free-text part of a Question. It is available with the Choices, unless the Question
refuses it. Other exists so that no person must select a Choice that is wrong for them.

Other is not a Choice. It is a second, parallel way to answer the same Question. A person
can answer with Choices, with Other, or with both.

## Answer

What one person gives for one Question: the Choices they selected, the Other text they
wrote, or both. An Answer exists when one part or both parts hold content.

## Outcome

How an Ask ended. An Ask has one of these three Outcomes:

- **Submitted** — the person answered each Question and confirmed. The assistant receives
  the Answers.
- **Cancelled** — the person refused to answer. The assistant receives no Answers. The
  assistant learns that the person made this choice.
- **Abandoned** — the person left and did not decide. The intention is the same as
  Cancelled. The report is different, so the assistant knows that no refusal occurred.

No Outcome returns a part of the Answers.
