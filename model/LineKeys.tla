---- MODULE LineKeys ----
(***************************************************************************)
(* The editor's line keys as a state machine.                              *)
(*                                                                         *)
(* A state is <<above, line, at>>: the kind of line above the caret's, the *)
(* kind of the caret's line, and where in that line the caret is.          *)
(* LineKeysRules holds one rule per state and key, read off the editor     *)
(* itself: the states it can lead to, whether it changed anything, and     *)
(* whether it leaves the model (into a code block or a table).             *)
(*                                                                         *)
(* `next` is every covered state that reads as the two lines the rule      *)
(* leaves. A state also depends on lines the rule does not touch, so this  *)
(* is a superset of what the editor does: a property that holds here holds *)
(* in the editor.                                                          *)
(***************************************************************************)
EXTENDS LineKeysRules, FiniteSets

VARIABLES state, last

Outside == <<"outside", "outside", "outside">>

Keys == {r.key : r \in Rules}

RulesFor(s, k) == {r \in Rules : r.from = s /\ r.key = k}

Init == state \in States /\ last = "none"

Press(k) ==
  /\ state \in States
  /\ \E r \in RulesFor(state, k) :
       /\ last' = k
       /\ IF r.leaves THEN state' = Outside
          ELSE IF ~r.changed THEN state' = state
          ELSE state' \in r.next

Next == \E k \in Keys : Press(k)

Spec == Init /\ [][Next]_<<state, last>>

TypeOK == state \in States \cup {Outside}

(* Every key has exactly one rule in every state it can be pressed in. *)
Deterministic == \A s \in States, k \in Keys : Cardinality(RulesFor(s, k)) <= 1

(* A rule that changes the document lands in a state the table covers. *)
Closed == \A r \in Rules : r.changed /\ ~r.leaves => r.next # {}

(* Backspace at the start of a line is always given a rule. *)
BackspaceCovered == \A s \in States : RulesFor(s, "Backspace") # {}

(* Enter can be undone: from every state Enter leads to, Backspace can     *)
(* lead back to the state Enter was pressed in. Checked for a caret at the *)
(* end of a line, where Enter adds a line and Backspace removes it.        *)
EnterUndone ==
  \A r \in Rules :
    r.key = "Enter" /\ r.from[3] = "end" /\ r.changed /\ ~r.leaves =>
      \A t \in r.next :
        \E b \in RulesFor(t, "Backspace") : b.changed /\ (b.leaves \/ r.from \in b.next)
====
