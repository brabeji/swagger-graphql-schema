import { startsWith } from 'lodash';

const stripBasePath = (swagger, path) => {
	const { basePath = '' } = swagger;
	if (startsWith(path, basePath)) {
		return path.substr(basePath.length)
	}
	return path;
};

export default stripBasePath;
