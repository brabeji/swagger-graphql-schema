export default ({ operation, faker }) => {
	const { responses } = operation;
	return new Promise(
		(resolve) => {
			resolve(faker(responses['200'].schema))
		},
	)
}
