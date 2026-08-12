# Diagram types

The beautiful-mermaid library reads a subset of the Mermaid language. This file lists the
types that the library renders, and the types that it refuses. Each example is tested against
version 1.1.3.

## Types that render

| Header | Use it for |
| --- | --- |
| `flowchart <dir>` or `graph <dir>` | A process, a workflow, or a decision tree |
| `sequenceDiagram` | An exchange of messages between parts |
| `stateDiagram-v2` | A lifecycle, or a state machine |
| `classDiagram` | An object model, or the parts of a system |
| `erDiagram` | A database schema |
| `xychart-beta` | A bar chart or a line chart |

The direction `<dir>` is `TD`, `TB`, `LR`, `BT`, or `RL`.

## Types that the library refuses

`mindmap`, `pie`, `gantt`, `journey`, `gitGraph`, `timeline`, `quadrantChart`, and
`C4Context` all fail. The error names the headers that the library accepts:

```
Invalid mermaid header: "pie title Pets". Expected "graph TD", "flowchart LR", ...
```

Choose a different type, or render that diagram with another tool.

## Examples

### Flowchart

```mermaid
flowchart LR
    A[Start] --> B{Ready?}
    B -->|yes| C[Ship]
    B -->|no| D[Fix]
    D --> B
```

Node shapes: `A[box]`, `A(rounded)`, `A([stadium])`, `A{diamond}`, `A((circle))`,
`A[[subroutine]]`, `A[(cylinder)]`, `A{{hexagon}}`.

Edges: `-->` solid, `-.->` dotted, `==>` thick. Add a label with `-->|text|`.

Groups:

```mermaid
flowchart TD
    subgraph api [API layer]
        R[Router] --> H[Handler]
    end
    H --> DB[(Database)]
```

### Sequence

```mermaid
sequenceDiagram
    participant U as User
    participant S as Server
    U->>S: Request
    S-->>U: Response
```

Declare each participant. A body with no `participant` line can render to 0 x 0.

### State

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: fetch
    Loading --> Idle: done
    Loading --> [*]: cancel
```

### Class

```mermaid
classDiagram
    class User {
        +String name
        +save()
    }
    User --> Post: creates
    Post --> Comment: has
```

### Entity relationship

```mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ITEM : contains
```

Cardinality: `||` one, `o{` zero or more, `|{` one or more.

### Chart

```mermaid
xychart-beta
    title "Revenue"
    x-axis [jan, feb, mar]
    y-axis "USD" 0 --> 100
    bar [10, 50, 90]
```

## Styling in the source

The library reads `classDef`, `class`, `:::`, `style`, and `linkStyle`. These override the
theme for the nodes and the edges that they name.

```mermaid
flowchart LR
    classDef warn fill:#f87171,stroke:#991b1b
    A[Start] --> B[Danger]:::warn
    style A fill:#bbf7d0
```

## Which type to choose

- A step follows a step, and a step can branch — **flowchart**.
- Two or more parts send messages in an order — **sequence**.
- One thing moves between named conditions — **state**.
- You show the parts of a system and what they hold — **class**.
- You show tables and their relations — **entity relationship**.
- You compare numbers — **chart**.

If two types fit, choose the flowchart. It is the type that most readers know.
