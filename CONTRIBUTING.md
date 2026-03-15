# Contributing to PocketCloud

Thank you for your interest in contributing to PocketCloud! This guide will help you get started.

## 📁 Project Structure

Before contributing, please familiarize yourself with our project structure by reading [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md). This will help you understand where to find and place files.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git
- Docker (optional, for testing)

### Development Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/pocketcloud.git
   cd pocketcloud
   ```

2. **Set up the development environment**
   ```bash
   ./scripts/dev-setup.sh
   ```

3. **Start development servers**
   ```bash
   # Start backend (from pocket-cloud/backend)
   cd pocket-cloud/backend
   npm install
   npm run dev

   # Start frontend (from pocket-cloud/frontend)
   cd ../frontend
   npm install
   npm run dev
   ```

## 🎯 Areas for Contribution

### 🐛 Bug Fixes
- Check [Issues](https://github.com/pocketcloud/pocketcloud/issues) for bugs
- Look for issues labeled `good first issue` or `bug`
- Test your fix thoroughly before submitting

### ✨ New Features
- Discuss new features in [Discussions](https://github.com/pocketcloud/pocketcloud/discussions) first
- Check the roadmap to see planned features
- Start with smaller features to get familiar with the codebase

### 📚 Documentation
- Improve existing documentation in `/docs/`
- Add code comments and examples
- Update README files in subdirectories
- Write tutorials and guides

### 🧪 Testing
- Add unit tests in `pocket-cloud/backend/src/tests/`
- Add integration tests in `pocket-cloud/tests/integration/`
- Add frontend tests in `pocket-cloud/frontend/src/tests/`
- Improve test coverage

### 🎨 UI/UX Improvements
- Work on the React frontend in `pocket-cloud/frontend/`
- Improve mobile responsiveness
- Enhance accessibility
- Design new components

### 🖥️ Client Applications
- Improve desktop clients in `clients/desktop-*/`
- Enhance the CLI client in `clients/cli/`
- Add new platform support

## 📝 Coding Guidelines

### General Principles
- Write clean, readable code
- Follow existing code style and patterns
- Add comments for complex logic
- Keep functions small and focused
- Use TypeScript where applicable

### File Organization
- Place files in the appropriate directories (see PROJECT_STRUCTURE.md)
- Use clear, descriptive file names
- Group related functionality together
- Follow the established naming conventions

### Backend (Node.js/TypeScript)
- Use Express.js patterns
- Follow RESTful API design
- Add proper error handling
- Use TypeScript types
- Write unit tests for services

### Frontend (React/TypeScript)
- Use functional components with hooks
- Follow React best practices
- Use TypeScript interfaces
- Add proper prop validation
- Write component tests

### Database
- Use migrations for schema changes
- Write efficient queries
- Add proper indexes
- Document schema changes

## 🔍 Code Review Process

1. **Before submitting:**
   - Run tests: `npm test`
   - Check linting: `npm run lint`
   - Verify TypeScript: `npm run typecheck`
   - Test your changes manually

2. **Pull Request Guidelines:**
   - Use a clear, descriptive title
   - Explain what your PR does and why
   - Reference related issues
   - Include screenshots for UI changes
   - Keep PRs focused and reasonably sized

3. **Review Process:**
   - Maintainers will review your PR
   - Address feedback promptly
   - Be open to suggestions and changes
   - Tests must pass before merging

## 🧪 Testing

### Running Tests
```bash
# Backend tests
cd pocket-cloud/backend
npm test

# Frontend tests
cd pocket-cloud/frontend
npm test

# Integration tests
cd pocket-cloud
npm run test:integration
```

### Writing Tests
- Write tests for new features
- Test edge cases and error conditions
- Use descriptive test names
- Mock external dependencies
- Aim for good test coverage

## 📋 Commit Guidelines

### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

### Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples
```
feat(api): add file sharing endpoints
fix(ui): resolve mobile navigation issue
docs(readme): update installation instructions
test(auth): add unit tests for login service
```

## 🚀 Release Process

Releases are handled by maintainers:
1. Version bumping with semantic versioning
2. Changelog generation
3. GitHub release creation
4. Docker image building
5. Documentation updates

## 💬 Getting Help

- **Questions?** Ask in [Discussions](https://github.com/pocketcloud/pocketcloud/discussions)
- **Chat:** Join our [Discord](https://discord.gg/pocketcloud)
- **Issues:** Report bugs in [Issues](https://github.com/pocketcloud/pocketcloud/issues)
- **Email:** Contact maintainers at contribute@pocketcloud.dev

## 🏆 Recognition

Contributors are recognized in:
- README.md contributors section
- Release notes
- Discord contributor role
- Annual contributor highlights

## 📄 License

By contributing to PocketCloud, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing to PocketCloud!** 🎉

Your contributions help make personal cloud storage accessible to everyone.