# Permissions
*Brainstorming um Rechte-Management in Ajna korrekt und effizient umzusetzen*

## use cases
1. der Besitzer eines Objekts o ändert die Berechtigungen von o
- mittels calc_effective_permissions() werden die Zugriffsrechte errechnet

2. Ein Benutzer verucht ein Objekt zu bearbeiten, auf das er indirekten Zugriff hat
- in den effektiven Berechtigungen ist der Benuzter enthalten; Regelwerke steuern den Zugriff darüber

3. Ein Benutzer tritt einer Gruppe bei, oder wird hinzugefügt
- das members-Array der Gruppe wird erweitert. group.update_group_members() wird ausgeführt um Objektberechtigungen zu aktualisieren

4. Ein Benutzer wird aus einer Gruppe entfernt
- analog zu 3.

5. Ein Benutzer erstellt eine Nutzerliste "Familie" und erlaubt Zugriff auf SmartHome-Objekte
- Eine neue Gruppe wird innerhalb des Benutzer-Objekts erstellt; die Mitglieder werden hinzugefügt. in den Objekt-permissions wird die Gruppe hinterlegt. Dann analog zu 3.

TODO: Gruppen als Gruppenmitglieder (calc_effective_permissions() erweitern: members rekursiv ermitteln)

WICHTIG: Konzept auf alle permissionierbaren Elemente Anwenden.


## schema of a 'group' entry

	group: 
		members: [userId2, userId3]
		referenced_by: obj1

## schema of a 'permission'-entry
	permissions:
		ref: [{
			subject: (ref)...user1,
			permission: rw
			},{
				subject: (ref)...group,
				permission: r
			}],
		effective: [
			userId1: rw,
			userId2: r,
			userId3: r
		]

## schema of an object
	object:
		id: obj1
		permissions: {
			standard: perm1,
			coordinates: perm2,
			inbox: null,
			action_inbox: perm3
		}
		coordinates: lat,lng
		inbox: []
		action_inbox: []

## required functions

	// user is added / removed to group
	group.update_group_members() {
		for (obj in group.referenced_by) {
			obj.update_group_members (group)
		}
	}

	// update permissions for a user
	obj.update_group_members (groupId) {
		delete from obj.permission_refs where obj.permissions.refs.subject.id == groupId
		obj.calc_effective_permissions('standard');
		for (key in ['coordinates', 'inbox', action_inbox']) {
			if (obj.permissions[key])
				obj.calc_effective_permissions(obj.permissions[key]);
			else
				obj.permissions[key] = obj.permissions['standard'];
		}
	}

	// calculate effective permissions as defined by permissions_refs 
	obj.calc_effective_permissions (perm) {
		perm.effective = [];
		for (ref in perm.refs) {
			var uids = [];
			if (ref.subject.type == 'group')
				uids = ref.subject.members;
			else if (ref.subject.type == 'user')
				uids = [ref.subject.id]
			else
				console.log('WTF?!');
			for (uid in uids) {
				perm.effective[uid] = merge_permissions(perm.effective[uid], ref.permission);
			}
		}
	}

	// calculate the merged permission from two different entries
	merge_permissions(perm1, perm2) {
		if (perm1=='rw' || perm2=='rw' || (perm1=='r' && perm2=='w') || (perm1=='w' && perm2=='r'))
			return 'rw';
		if (perm1=='w' || perm2=='w')
			return 'w';
		if (perm1=='r' || perm2=='r)
			return 'r';
		return false;
	}
