interface SerializedRoom {
	id: string;
	name: string;
	topic: string;
}

interface SerializedEvent {
	id: string;
	roomId: string;
	senderId: string;
	displayName: string;
	type: string;
	body: string;
	content: Record<string, unknown>;
	timestamp: number;
	sequenceId: number;
}

interface Member {
	userId: string;
	displayName: string;
}

interface BootstrapResponse {
	rooms: SerializedRoom[];
}

interface TimelineResponse {
	events: SerializedEvent[];
	members: Member[];
}

interface RoomResponse {
	room: SerializedRoom;
}

interface JoinResponse {
	event: SerializedEvent;
	members: Member[];
}

type ApiResponseMap = {
	"/api/bootstrap": BootstrapResponse;
};

type SsePayload =
	| { type: "event"; event: SerializedEvent }
	| { type: "room.created"; room: SerializedRoom }
	| { type: "sync"; events: SerializedEvent[]; nextToken: number };

const state = {
	rooms: [] as SerializedRoom[],
	activeRoomId: "",
	eventsByRoom: new Map<string, SerializedEvent[]>(),
	membersByRoom: new Map<string, Member[]>(),
	seenEventIds: new Set<string>(),
	userId: localStorage.getItem("chatcore:userId") ?? crypto.randomUUID(),
	displayName: localStorage.getItem("chatcore:displayName") ?? "",
};

localStorage.setItem("chatcore:userId", state.userId);

function requireElement<T extends HTMLElement>(selector: string): T {
	const element = document.querySelector<T>(selector);
	if (element === null) {
		throw new Error(`Missing element: ${selector}`);
	}
	return element;
}

const elements = {
	connectionStatus: requireElement<HTMLSpanElement>("#connectionStatus"),
	displayName: requireElement<HTMLInputElement>("#displayName"),
	joinButton: requireElement<HTMLButtonElement>("#joinButton"),
	memberList: requireElement<HTMLDivElement>("#memberList"),
	messageBody: requireElement<HTMLInputElement>("#messageBody"),
	messageForm: requireElement<HTMLFormElement>("#messageForm"),
	messages: requireElement<HTMLDivElement>("#messages"),
	roomForm: requireElement<HTMLFormElement>("#roomForm"),
	roomList: requireElement<HTMLElement>("#roomList"),
	roomName: requireElement<HTMLInputElement>("#roomName"),
	roomTitle: requireElement<HTMLHeadingElement>("#roomTitle"),
	roomTopic: requireElement<HTMLParagraphElement>("#roomTopic"),
};

elements.displayName.value = state.displayName;

function setStatus(label: string): void {
	elements.connectionStatus.textContent = label;
	elements.connectionStatus.dataset.state = label.toLowerCase();
}

function currentDisplayName(): string {
	const value = elements.displayName.value.trim();
	return value.length > 0 ? value : `Guest ${state.userId.slice(0, 4)}`;
}

function rememberDisplayName(): void {
	state.displayName = currentDisplayName();
	localStorage.setItem("chatcore:displayName", state.displayName);
}

async function api<K extends keyof ApiResponseMap>(
	path: K,
	options?: RequestInit,
): Promise<ApiResponseMap[K]>;
async function api<T>(path: string, options?: RequestInit): Promise<T>;
async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
	const response = await fetch(path, {
		headers: { "content-type": "application/json" },
		...options,
	});
	if (!response.ok) {
		const payload = (await response
			.json()
			.catch(() => ({ error: response.statusText }))) as { error?: string };
		throw new Error(payload.error ?? "Request failed");
	}
	return (await response.json()) as T;
}

function activeRoom(): SerializedRoom | null {
	return state.rooms.find((room) => room.id === state.activeRoomId) ?? null;
}

function formatTime(timestamp: number): string {
	const instant = Temporal.Instant.fromEpochMilliseconds(timestamp);
	const zonedDateTime = instant.toZonedDateTimeISO(Temporal.Now.timeZoneId());
	return zonedDateTime.toLocaleString(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});
}

function renderRooms(): void {
	elements.roomList.replaceChildren(
		...state.rooms.map((room) => {
			const button = document.createElement("button");
			button.type = "button";
			button.className = "room-button";
			button.dataset.active = String(room.id === state.activeRoomId);
			button.textContent = room.name;
			button.addEventListener("click", () => {
				void selectRoom(room.id);
			});
			return button;
		}),
	);
}

function mergeRoom(room: SerializedRoom): void {
	state.rooms = state.rooms.filter((item) => item.id !== room.id);
	state.rooms.push(room);
	state.rooms.sort((a, b) => a.name.localeCompare(b.name));
}

function renderMembers(): void {
	const members = state.membersByRoom.get(state.activeRoomId) ?? [];
	if (members.length === 0) {
		elements.memberList.textContent = "No joined members yet";
		return;
	}
	elements.memberList.replaceChildren(
		...members.map((member) => {
			const item = document.createElement("span");
			item.textContent = member.displayName;
			return item;
		}),
	);
}

function renderMessages(): void {
	const events = state.eventsByRoom.get(state.activeRoomId) ?? [];
	const messageEvents = events.filter((event) => event.type === "message.text");

	elements.messages.replaceChildren(
		...messageEvents.map((event) => {
			const article = document.createElement("article");
			article.className = "message";
			article.dataset.mine = String(event.senderId === state.userId);

			const meta = document.createElement("div");
			meta.className = "message-meta";
			meta.textContent = `${event.displayName} - ${formatTime(event.timestamp)} - #${event.sequenceId}`;

			const body = document.createElement("p");
			body.textContent = event.body;

			article.append(meta, body);
			return article;
		}),
	);
	elements.messages.scrollTop = elements.messages.scrollHeight;
}

function renderActiveRoom(): void {
	const room = activeRoom();
	elements.roomTitle.textContent = room?.name ?? "No room selected";
	elements.roomTopic.textContent = room?.topic || "ChatCore event stream";
	elements.joinButton.disabled = room === null;
	elements.messageBody.disabled = room === null;
	const submitButton =
		elements.messageForm.querySelector<HTMLButtonElement>("button");
	if (submitButton !== null) submitButton.disabled = room === null;
	renderRooms();
	renderMembers();
	renderMessages();
}

function mergeEvent(event: SerializedEvent): void {
	if (state.seenEventIds.has(event.id)) return;
	state.seenEventIds.add(event.id);

	const events = state.eventsByRoom.get(event.roomId) ?? [];
	events.push(event);
	events.sort((a, b) => a.sequenceId - b.sequenceId);
	state.eventsByRoom.set(event.roomId, events);

	if (event.type === "room.member") {
		const member = {
			userId: event.senderId,
			displayName:
				typeof event.content.displayName === "string"
					? event.content.displayName
					: event.senderId,
		};
		const members =
			state.membersByRoom
				.get(event.roomId)
				?.filter((item) => item.userId !== member.userId) ?? [];
		members.push(member);
		members.sort((a, b) => a.displayName.localeCompare(b.displayName));
		state.membersByRoom.set(event.roomId, members);
	}
}

async function selectRoom(roomId: string): Promise<void> {
	state.activeRoomId = roomId;
	const payload = await api<TimelineResponse>(
		`/api/rooms/${encodeURIComponent(roomId)}/timeline`,
	);
	const events = [...payload.events].sort(
		(a, b) => a.sequenceId - b.sequenceId,
	);
	state.eventsByRoom.set(roomId, events);
	state.membersByRoom.set(roomId, payload.members);
	for (const event of events) state.seenEventIds.add(event.id);
	renderActiveRoom();
}

function connectEvents(): void {
	const source = new EventSource("/api/events");
	source.addEventListener("open", () => setStatus("Live"));
	source.addEventListener("error", () => setStatus("Reconnecting"));
	source.addEventListener("message", (message) => {
		const payload = JSON.parse(message.data) as SsePayload;
		if (payload.type === "sync") {
			for (const event of payload.events) mergeEvent(event);
		}
		if (payload.type === "event") mergeEvent(payload.event);
		if (payload.type === "room.created") {
			mergeRoom(payload.room);
		}
		renderActiveRoom();
	});
}

elements.displayName.addEventListener("change", rememberDisplayName);

elements.roomForm.addEventListener("submit", (event) => {
	event.preventDefault();
	rememberDisplayName();
	const name = elements.roomName.value.trim();
	if (name.length === 0) return;
	elements.roomName.value = "";
	void api<RoomResponse>("/api/rooms", {
		method: "POST",
		body: JSON.stringify({
			creatorId: state.userId,
			name,
			topic: `${currentDisplayName()} created this room.`,
		}),
	}).then((payload) => {
		mergeRoom(payload.room);
		return selectRoom(payload.room.id);
	});
});

elements.joinButton.addEventListener("click", () => {
	if (state.activeRoomId.length === 0) return;
	rememberDisplayName();
	void api<JoinResponse>(
		`/api/rooms/${encodeURIComponent(state.activeRoomId)}/join`,
		{
			method: "POST",
			body: JSON.stringify({
				userId: state.userId,
				displayName: currentDisplayName(),
			}),
		},
	).then((payload) => {
		state.membersByRoom.set(state.activeRoomId, payload.members);
		renderActiveRoom();
	});
});

elements.messageForm.addEventListener("submit", (event) => {
	event.preventDefault();
	if (state.activeRoomId.length === 0) return;
	rememberDisplayName();
	const body = elements.messageBody.value.trim();
	if (body.length === 0) return;
	elements.messageBody.value = "";
	void api<{ event: SerializedEvent }>(
		`/api/rooms/${encodeURIComponent(state.activeRoomId)}/messages`,
		{
			method: "POST",
			body: JSON.stringify({
				senderId: state.userId,
				displayName: currentDisplayName(),
				body,
			}),
		},
	);
});

async function boot(): Promise<void> {
	const payload = await api("/api/bootstrap");
	state.rooms = payload.rooms;
	state.rooms.sort((a, b) => a.name.localeCompare(b.name));
	if (state.rooms[0]) await selectRoom(state.rooms[0].id);
	connectEvents();
}

boot().catch((error: unknown) => {
	console.error(error);
	setStatus("Offline");
});
