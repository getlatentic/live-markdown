---- MODULE LineKeys ----
(***************************************************************************)
(* The editor's line keys as a state machine.                              *)
(*                                                                         *)
(* A state is <<above, line, at>>: the kind of line above the caret's, the *)
(* kind of the caret's line, and where in that line the caret is.          *)
(* LineKeysRules holds one rule per state and key, read off the editor     *)
(* itself: the states it can lead to, whether it changed anything, and     *)
(* whether it leaves the model (into a code block or a table). A rule     *)
(* with no `next` lands where the table has no state; those places are     *)
(* listed in line-keys.uncovered.tsv and also count as leaving.            *)
(*                                                                         *)
(* `next` is every covered state that reads as the two lines the rule      *)
(* leaves. A state also depends on lines the rule does not touch, so this  *)
(* is a superset of what the editor does: a property that holds here holds *)
(* in the editor.                                                          *)
(***************************************************************************)
EXTENDS LineKeysRules, Naturals, FiniteSets

VARIABLES state, last

Outside == <<"outside", "outside", "outside">>

Keys == {r.key : r \in Rules}

RulesFor(s, k) == {r \in Rules : r.from = s /\ r.key = k}

Init == state \in States /\ last = "none"

Press(k) ==
  /\ state \in States
  /\ \E r \in RulesFor(state, k) :
       /\ last' = k
       /\ IF r.leaves \/ (r.changed /\ r.next = {}) THEN state' = Outside
          ELSE IF ~r.changed THEN state' = state
          ELSE state' \in r.next

(* Outside the model nothing more is said: the machine rests there. *)
Next == (\E k \in Keys : Press(k)) \/ (state = Outside /\ UNCHANGED <<state, last>>)

Spec == Init /\ [][Next]_<<state, last>>

TypeOK == state \in States \cup {Outside}

(* Every key has exactly one rule in every state it can be pressed in. *)
Deterministic == \A s \in States, k \in Keys : Cardinality(RulesFor(s, k)) <= 1

(* Backspace at the start of a line is always given a rule. *)
BackspaceCovered == \A s \in States : RulesFor(s, "Backspace") # {}

(* Enter can be undone: after Enter at the end of a line, Backspace can    *)
(* lead back to the state Enter was pressed in, in at most two presses.    *)
(* Two, because Enter in a list makes an empty item, and the first         *)
(* Backspace takes that item's marker before the second joins the lines.   *)
Back(s) == UNION {b.next : b \in {r \in RulesFor(s, "Backspace") : r.changed}}

EnterUndone ==
  \A r \in Rules :
    r.key = "Enter" /\ r.from[3] = "end" /\ r.changed /\ ~r.leaves =>
      \A t \in r.next :
        r.from \in Back(t) \/ \E u \in Back(t) : r.from \in Back(u)
====
