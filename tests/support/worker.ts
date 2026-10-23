export default {
	fetch: () =>
		new Response('test worker entry; tests call the server API directly', { status: 501 })
} satisfies ExportedHandler;
