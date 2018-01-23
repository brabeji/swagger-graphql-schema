export default ({ operation, faker }) => {
	const { responses } = operation;
	return faker(responses['200'].schema);
}
